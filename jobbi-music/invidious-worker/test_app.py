"""Safe, offline tests for ID3 repair and owner-scoped worker inspection."""
import tempfile
import unittest
from pathlib import Path
import app
from mutagen.id3 import ID3, TIT2, TPE1

class InvidiousRepairTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.original_folder = app.FOLDER
        self.original_jobs = app.jobs
        app.FOLDER = Path(self.folder.name)
        app.jobs = []

    def tearDown(self):
        app.FOLDER = self.original_folder
        app.jobs = self.original_jobs
        self.folder.cleanup()

    def make_recording(self, video_id, title, artist):
        path = app.FOLDER / ('YouTube_title_['+video_id+'].mp3')
        path.write_bytes(b'')
        tags = ID3()
        tags.add(TIT2(encoding=3, text=title))
        tags.add(TPE1(encoding=3, text=artist))
        tags.save(str(path))
        return path

    def test_existing_wrong_video_tags_repaired_without_redownload(self):
        video = 'rTL50MyBHPs'
        file = self.make_recording(video, 'Official YouTube Video 2026', 'Video Channel')
        initial_bytes = file.stat().st_size
        result = app.tag_recording(video, 'Little Dark Age', 'MGMT')
        self.assertEqual(result['status'], 'tagged')
        tags = ID3(str(file))
        self.assertEqual(str(tags.getall('TIT2')[0].text[0]), 'Little Dark Age')
        self.assertEqual(str(tags.getall('TPE1')[0].text[0]), 'MGMT')
        self.assertEqual(len(list(app.FOLDER.glob('*.mp3'))), 1)
        self.assertGreaterEqual(file.stat().st_size, initial_bytes // 2)
        self.assertEqual(app.tag_recording(video, 'Little Dark Age', 'MGMT')['status'],
                         'already_tagged')

    def test_worker_can_repair_file_after_job_history_trimmed(self):
        video = 'hmpJq3LsR48'
        self.make_recording(video, 'Unmatched video title', 'Uploader')
        self.assertEqual(app.snapshot_owner('user-test', [video])[0]['status'],
                         'unconfirmed')
        self.assertTrue(app.snapshot_owner('user-test', [video])[0]['present'])
        result = app.tag_recording(video, 'Bloody Stream', 'Coda')
        self.assertTrue(result['found'])
        self.assertEqual(result['status'], 'tagged')

    def test_invalid_ids_and_absent_files_do_not_mutate_music(self):
        existing = self.make_recording('hmpJq3LsR48', 'Original', 'Uploader')
        self.assertFalse(app.tag_recording('../etc/passwd', 'Wrong', 'Wrong')['found'])
        self.assertFalse(app.tag_recording('12345678901', 'Wrong', 'Wrong')['found'])
        self.assertEqual(str(ID3(str(existing)).getall('TIT2')[0].text[0]), 'Original')

    def test_bulk_inspection_finds_471_ids_without_repeated_directory_glob(self):
        videos = [format(i, '011d') for i in range(471)]
        for i in (0, 250, 470):
            self.make_recording(videos[i], 'Example', 'Example')
        # A duplicated source ID must not be treated as a uniquely identified file.
        (app.FOLDER / ('Another_name_['+videos[250]+'].mp3')).write_bytes(b'')
        original_matcher = app.matching_recording
        def unexpected_per_video_glob(_):
            raise AssertionError('Batch inspection must not glob once per video')
        app.matching_recording = unexpected_per_video_glob
        try:
            rows = app.snapshot_owner('user-test', videos)
        finally:
            app.matching_recording = original_matcher
        self.assertEqual(len(rows), 471)
        self.assertTrue(rows[0]['present'])
        self.assertFalse(rows[250]['present'])
        self.assertTrue(rows[470]['present'])
        self.assertFalse(rows[400]['present'])

    def test_inspector_scopes_job_status_to_owner(self):
        video = 'rTL50MyBHPs'
        app.jobs = [{'id':'job-1', 'owner':'user-a', 'videoId':video,
                     'status':'completed'}]
        self.make_recording(video, 'Video', 'Artist')
        mine = app.snapshot_owner('user-a', [video])
        theirs = app.snapshot_owner('user-b', [video])
        self.assertEqual(mine[0]['status'], 'completed')
        self.assertEqual(theirs[0]['status'], 'unconfirmed')
        self.assertTrue(mine[0]['present'])
        self.assertTrue(theirs[0]['present'])

if __name__ == '__main__':
    unittest.main()
