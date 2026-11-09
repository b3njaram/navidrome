"""Private optional audio importer, only for media the user may lawfully save.
No public ports; accept only a video ID, never an arbitrary URL or command.
"""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Lock
from urllib.parse import urlparse, parse_qs
import json, os, re, secrets, subprocess, uuid, time

TOKEN = os.getenv('WORKER_SECRET', '')
VIDEO = re.compile(r'^[A-Za-z0-9_-]{11}$')
USER = re.compile(r'^[a-zA-Z0-9_.@-]{1,80}$')
FOLDER=Path('/imports')
STATE=Path('/imports/.jobbi-state/jobs.json')
LOCK=Lock()
EXECUTOR=ThreadPoolExecutor(max_workers=2)
MAX_ACTIVE=8
RESERVE=4*1024**3

def load():
    try:
        rows=json.loads(STATE.read_text())
        if isinstance(rows,list):
            for row in rows:
                if row.get('status') in ('running','queued'):row['status']='interrupted'
            return rows[-150:]
    except (ValueError,OSError):pass
    return []
jobs=load()
def persist():
    STATE.parent.mkdir(parents=True,exist_ok=True)
    tmp=STATE.with_suffix('.tmp')
    tmp.write_text(json.dumps(jobs[-150:]),encoding='utf8')
    os.replace(tmp,STATE)
def change(job_id,status):
    with LOCK:
        for job in jobs:
            if job['id']==job_id:
                job['status']=status
                job['updatedAt']=int(time.time())
                break
        try:persist()
        except OSError:pass

def download(job_id,video_id):
    change(job_id,'running')
    try:
        args=['yt-dlp','--no-playlist','--no-overwrites','--restrict-filenames',
              '--no-progress','--quiet','--no-warnings','--no-part',
              '--socket-timeout','20','--retries','2','--fragment-retries','2',
              '--max-filesize','180M','--match-filter','!is_live & duration < 900',
              '-x','--audio-format','mp3','--audio-quality','2',
              '--add-metadata','--paths',str(FOLDER),
              '-o','%(title).100B [%(id)s].%(ext)s',
              'https://www.youtube.com/watch?v='+video_id]
        done=subprocess.run(args,stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,
              stderr=subprocess.PIPE,timeout=360,check=False,text=True)
        change(job_id,'completed' if done.returncode==0 else 'failed')
    except (OSError,subprocess.TimeoutExpired):change(job_id,'failed')

class Handler(BaseHTTPRequestHandler):
    def log_message(self,*args):pass
    def send_json(self,status,data):
        raw=json.dumps(data).encode()
        self.send_response(status)
        self.send_header('Content-Type','application/json')
        self.send_header('Cache-Control','no-store')
        self.send_header('Content-Length',str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)
    def authorized(self):
        return len(TOKEN)>=32 and secrets.compare_digest(
            str(self.headers.get('X-Worker-Token','')),TOKEN)
    def do_GET(self):
        target=urlparse(self.path)
        if target.path=='/health':return self.send_json(200,{'ok':True})
        if not self.authorized():return self.send_json(403,{'error':'Forbidden'})
        if target.path=='/jobs':
            owner=parse_qs(target.query).get('owner',[''])[0].lower()
            if not USER.fullmatch(owner):return self.send_json(400,{'error':'Invalid user'})
            with LOCK:result=[j.copy() for j in jobs if j['owner']==owner][-50:]
            return self.send_json(200,{'jobs':list(reversed(result))})
        return self.send_json(404,{'error':'Not found'})
    def do_POST(self):
        if self.path!='/import':return self.send_json(404,{'error':'Not found'})
        if not self.authorized():return self.send_json(403,{'error':'Forbidden'})
        try:
            length=int(self.headers.get('Content-Length','0'))
            if length<=0 or length>8192:return self.send_json(413,{'error':'Invalid request size'})
            data=json.loads(self.rfile.read(length))
            vid=data.get('videoId','')
            user=str(data.get('owner','')).lower()
            if not isinstance(vid,str) or not VIDEO.fullmatch(vid) or not USER.fullmatch(user):
                return self.send_json(400,{'error':'Invalid user or video'})
            if not FOLDER.is_dir() or not os.access(FOLDER,os.W_OK):
                return self.send_json(503,{'error':'NAS import folder needs write permission'})
            space=os.statvfs(FOLDER)
            if space.f_bavail*space.f_frsize<RESERVE+180*1024**2:
                return self.send_json(507,{'error':'NAS storage reserve reached'})
            with LOCK:
                if sum(1 for j in jobs if j['status'] in ('running','queued'))>=MAX_ACTIVE:
                    return self.send_json(429,{'error':'Import queue full'})
                if any(j.get('videoId')==vid and j['status'] in ('running','queued','completed') for j in jobs):
                    return self.send_json(409,{'error':'This video was already imported or queued'})
                job={'id':str(uuid.uuid4()),'videoId':vid,'owner':user,
                     'title':str(data.get('title',''))[:160],
                     'artist':str(data.get('artist',''))[:120],
                     'status':'queued','createdAt':int(time.time()),'updatedAt':int(time.time())}
                jobs.append(job)
                del jobs[:-150]
                persist()
            EXECUTOR.submit(download,job['id'],vid)
            return self.send_json(202,{'queued':True,'jobId':job['id']})
        except (TypeError,ValueError):
            return self.send_json(400,{'error':'Invalid JSON'})
        except OSError:
            return self.send_json(503,{'error':'NAS storage unavailable'})

if __name__=='__main__':
    if len(TOKEN)<32:raise SystemExit('Configure a 32+ character WORKER_SECRET')
    ThreadingHTTPServer(('0.0.0.0',8091),Handler).serve_forever()
