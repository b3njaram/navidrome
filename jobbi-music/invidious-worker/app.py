"""Private optional audio importer, only for media the user may lawfully save.
No public ports; accept only video IDs, never arbitrary URLs, paths or commands.
"""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Lock
from urllib.parse import urlparse, parse_qs
from mutagen.id3 import ID3, ID3NoHeaderError, TIT2, TPE1
import json, os, re, secrets, subprocess, uuid, time

TOKEN = os.getenv('WORKER_SECRET', '')
VIDEO = re.compile(r'^[A-Za-z0-9_-]{11}$')
USER = re.compile(r'^[a-zA-Z0-9_.@-]{1,80}$')
FOLDER = Path('/imports')
STATE = Path('/imports/.jobbi-state/jobs.json')
LOCK = Lock()
EXECUTOR = ThreadPoolExecutor(max_workers=2)
MAX_ACTIVE = 8
RESERVE = 4*1024**3
MAX_REQUEST = 65536

def load():
    try:
        rows = json.loads(STATE.read_text())
        if isinstance(rows, list):
            for row in rows:
                if row.get('status') in ('running', 'queued'):
                    row['status'] = 'interrupted'
            return rows[-5000:]
    except (ValueError, OSError):
        pass
    return []

jobs = load()

def persist():
    STATE.parent.mkdir(parents=True, exist_ok=True)
    tmp = STATE.with_suffix('.tmp')
    tmp.write_text(json.dumps(jobs[-5000:]), encoding='utf8')
    os.replace(tmp, STATE)

def change(job_id, status, note=None):
    with LOCK:
        for job in jobs:
            if job['id'] == job_id:
                job['status'] = status
                job['updatedAt'] = int(time.time())
                if note is not None:
                    job['note'] = str(note)[:160]
                break
        try:
            persist()
        except OSError:
            pass

def matching_recording(video_id):
    """Find an existing finished MP3 by its fixed 11-character source ID.
    Never follow symlinks or use user-supplied filenames as paths.
    """
    if not isinstance(video_id, str) or not VIDEO.fullmatch(video_id):
        return None
    try:
        root = FOLDER.resolve(strict=True)
        matches = [
            item for item in FOLDER.glob('*'+video_id+'*.mp3')
            if item.is_file() and not item.is_symlink()
            and item.resolve().parent == root
            and video_id in item.stem
        ]
        return matches[0] if len(matches) == 1 else None
    except OSError:
        return None

def tag_recording(video_id, title, artist):
    """Repair metadata in place; never download a second copy or rename files."""
    if not isinstance(title, str) or not isinstance(artist, str) or not title.strip() or not artist.strip():
        return {'found': False, 'status': 'invalid_metadata'}
    title, artist = title.strip()[:200], artist.strip()[:140]
    path = matching_recording(video_id)
    if path is None:
        return {'found': False, 'status': 'file_not_found'}
    try:
        try:
            tags = ID3(str(path))
        except ID3NoHeaderError:
            tags = ID3()
        previous_title = str(tags.getall('TIT2')[0].text[0]) if tags.getall('TIT2') else ''
        previous_artist = str(tags.getall('TPE1')[0].text[0]) if tags.getall('TPE1') else ''
        if previous_title == title and previous_artist == artist:
            return {'found': True, 'status': 'already_tagged', 'changed': False}
        tags.delall('TIT2')
        tags.delall('TPE1')
        tags.add(TIT2(encoding=3, text=title))
        tags.add(TPE1(encoding=3, text=artist))
        tags.save(str(path), v2_version=3)
        return {'found': True, 'status': 'tagged', 'changed': True}
    except (OSError, ValueError, TypeError):
        return {'found': True, 'status': 'tagging_failed', 'changed': False}

def snapshot_owner(owner, video_ids):
    """Inspect a batch with ONE directory scan, not a glob for each video ID.

    A large saved collection can contain hundreds of distinct source IDs.
    Repeated glob/stat calls on a spinning-disk NAS risk exhausting the
    authenticated server's worker-inspection timeout.
    """
    requested = set(video_ids)
    with LOCK:
        known = {
            j['videoId']: j.copy()
            for j in jobs if j.get('owner') == owner and j.get('videoId') in requested
        }
    matches = {video_id: 0 for video_id in requested}
    try:
        root = FOLDER.resolve(strict=True)
        for item in FOLDER.iterdir():
            if item.suffix != '.mp3' or item.is_symlink() or not item.is_file():
                continue
            if item.resolve().parent != root:
                continue
            # Keep matching_recording's exact semantics: if more than one
            # candidate has this source ID, its presence is ambiguous.
            stem = item.stem
            for video_id in requested:
                if video_id in stem:
                    matches[video_id] += 1
    except OSError:
        pass
    return [
        {
            'videoId': video_id,
            'status': known[video_id].get('status') if video_id in known else 'unconfirmed',
            'present': matches[video_id] == 1
        }
        for video_id in video_ids
    ]

def repair_completed_history():
    """One-time, non-destructive recovery for older imports after a worker restart."""
    with LOCK:
        finished = [
            (j['videoId'], j.get('title', ''), j.get('artist', ''))
            for j in jobs if j.get('status') == 'completed'
        ]
    for video_id, title, artist in finished:
        tag_recording(video_id, title, artist)

def download(job_id, video_id):
    change(job_id, 'running')
    try:
        args = ['yt-dlp', '--no-playlist', '--no-overwrites', '--restrict-filenames',
                '--no-progress', '--quiet', '--no-warnings', '--no-part',
                '--socket-timeout', '20', '--retries', '2', '--fragment-retries', '2',
                '--max-filesize', '180M', '--match-filter', '!is_live & duration < 900',
                '-x', '--audio-format', 'mp3', '--audio-quality', '2',
                '--add-metadata', '--paths', str(FOLDER),
                '-o', '%(title).100B [%(id)s].%(ext)s',
                'https://www.youtube.com/watch?v='+video_id]
        done = subprocess.run(args, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                              stderr=subprocess.PIPE, timeout=360, check=False, text=True)
        if done.returncode != 0:
            change(job_id, 'failed', 'Audio worker download failed')
            return
        with LOCK:
            job = next((j.copy() for j in jobs if j['id'] == job_id), None)
        result = tag_recording(video_id, job.get('title', '') if job else '',
                               job.get('artist', '') if job else '')
        if not result['found']:
            change(job_id, 'needs_review', 'Download finished, but the MP3 could not be located')
        elif result['status'] == 'tagging_failed':
            change(job_id, 'needs_review', 'MP3 exists but its music tags could not be updated')
        else:
            change(job_id, 'completed')
    except (OSError, subprocess.TimeoutExpired):
        change(job_id, 'failed', 'Audio worker interrupted or timed out')

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def send_json(self, status, data):
        raw = json.dumps(data).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def authorized(self):
        return len(TOKEN) >= 32 and secrets.compare_digest(
            str(self.headers.get('X-Worker-Token', '')), TOKEN)

    def read_json(self):
        length = int(self.headers.get('Content-Length', '0'))
        if length <= 0 or length > MAX_REQUEST:
            raise ValueError('Invalid request size')
        return json.loads(self.rfile.read(length))

    def do_GET(self):
        target = urlparse(self.path)
        if target.path == '/health':
            return self.send_json(200, {'ok': True})
        if not self.authorized():
            return self.send_json(403, {'error': 'Forbidden'})
        if target.path == '/jobs':
            owner = parse_qs(target.query).get('owner', [''])[0].lower()
            if not USER.fullmatch(owner):
                return self.send_json(400, {'error': 'Invalid user'})
            with LOCK:
                result = [j.copy() for j in jobs if j['owner'] == owner][-200:]
            return self.send_json(200, {'jobs': list(reversed(result))})
        return self.send_json(404, {'error': 'Not found'})

    def do_POST(self):
        if not self.authorized():
            return self.send_json(403, {'error': 'Forbidden'})
        if self.path not in ('/import', '/inspect', '/repair'):
            return self.send_json(404, {'error': 'Not found'})
        try:
            data = self.read_json()
            owner = str(data.get('owner', '')).lower()
            if not USER.fullmatch(owner):
                return self.send_json(400, {'error': 'Invalid owner'})
            if self.path == '/inspect':
                requested = data.get('videoIds')
                if not isinstance(requested, list) or len(requested) > 500 or any(
                    not isinstance(v, str) or not VIDEO.fullmatch(v) for v in requested
                ):
                    return self.send_json(400, {'error': 'Invalid requested IDs'})
                return self.send_json(200, {'items': snapshot_owner(owner, requested)})
            if self.path == '/repair':
                video_id = data.get('videoId')
                title = data.get('title')
                artist = data.get('artist')
                if not isinstance(video_id, str) or not VIDEO.fullmatch(video_id) or \
                        not isinstance(title, str) or not 0 < len(title) <= 200 or \
                        not isinstance(artist, str) or not 0 < len(artist) <= 140:
                    return self.send_json(400, {'error': 'Invalid recording metadata'})
                with LOCK:
                    conflict = any(j.get('videoId') == video_id and
                                   j.get('owner') != owner for j in jobs)
                    running = any(j.get('videoId') == video_id and
                                  j.get('status') in ('running', 'queued') for j in jobs)
                if conflict:
                    return self.send_json(403, {'error': 'Recording belongs to another owner'})
                if running:
                    return self.send_json(409, {'error': 'Recording still transferring'})
                return self.send_json(200, tag_recording(video_id, title, artist))
            video_id = data.get('videoId', '')
            if not isinstance(video_id, str) or not VIDEO.fullmatch(video_id):
                return self.send_json(400, {'error': 'Invalid video'})
            if not FOLDER.is_dir() or not os.access(FOLDER, os.W_OK):
                return self.send_json(503, {'error': 'NAS import folder needs write permission'})
            space = os.statvfs(FOLDER)
            if space.f_bavail*space.f_frsize < RESERVE + 180*1024**2:
                return self.send_json(507, {'error': 'NAS storage reserve reached'})
            with LOCK:
                if sum(1 for j in jobs if j['status'] in ('running', 'queued')) >= MAX_ACTIVE:
                    return self.send_json(429, {'error': 'Import queue full'})
                if any(j.get('videoId') == video_id and
                       j['status'] in ('running', 'queued', 'completed') for j in jobs):
                    return self.send_json(409, {'error': 'This video was already imported or queued'})
                job = {
                    'id': str(uuid.uuid4()), 'videoId': video_id, 'owner': owner,
                    'title': str(data.get('title', ''))[:160],
                    'artist': str(data.get('artist', ''))[:120],
                    'status': 'queued', 'createdAt': int(time.time()),
                    'updatedAt': int(time.time())
                }
                jobs.append(job)
                del jobs[:-5000]
                persist()
            EXECUTOR.submit(download, job['id'], video_id)
            return self.send_json(202, {'queued': True, 'jobId': job['id']})
        except (TypeError, ValueError):
            return self.send_json(400, {'error': 'Invalid JSON'})
        except OSError:
            return self.send_json(503, {'error': 'NAS storage unavailable'})

if __name__ == '__main__':
    if len(TOKEN) < 32:
        raise SystemExit('Configure a 32+ character WORKER_SECRET')
    EXECUTOR.submit(repair_completed_history)
    ThreadingHTTPServer(('0.0.0.0', 8091), Handler).serve_forever()
