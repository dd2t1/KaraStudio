"""Run with: python -m unittest discover -s home-assistant -p 'test_*.py'."""
import importlib.util
import io
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("storage", Path(__file__).parent / "custom_components/karaoke_storage/storage.py")
storage = importlib.util.module_from_spec(spec)
spec.loader.exec_module(storage)


class StorageTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.project = json.dumps({"lyrics": [{"text": "Bonjour", "start": 0, "end": 2}]})

    def audio(self, name="../../musique.mp3", value=b"original-audio"):
        return SimpleNamespace(filename=name, file=io.BytesIO(value))

    def test_complete_pair_and_unique_saves(self):
        first = storage.save_project(self.root, self.project, self.audio())
        second = storage.save_project(self.root, self.project, self.audio())
        self.assertNotEqual(first, second)
        self.assertEqual((self.root / first).read_bytes(), b"original-audio")
        data = json.loads((self.root / first).with_name("niveau.json").read_text(encoding="utf-8"))
        self.assertEqual(data["songInfo"]["audioFile"], "musique.mp3")
        self.assertEqual(len(list((self.root / "karaoke").iterdir())), 2)

    def test_spotify_project_without_audio(self):
        data = json.loads(self.project)
        data['songInfo'] = {'spotifyTrackId': '3sHa6NoDxdvS7SYApXJUrC'}
        relative = storage.save_project(self.root, json.dumps(data), None)
        saved = json.loads((self.root / relative).read_text(encoding='utf-8'))
        self.assertIsNone(saved['songInfo']['audioFile'])
        self.assertEqual(len(list((self.root / relative).parent.iterdir())), 1)
        with self.assertRaises(ValueError):
            storage.save_project(self.root, json.dumps(data), self.audio())
        data['songInfo']['spotifyTrackId'] = '../bad'
        with self.assertRaises(ValueError):
            storage.save_project(self.root, json.dumps(data), None)

    def test_invalid_inputs_write_nothing(self):
        for project, audio in [("{}", self.audio()), (self.project, self.audio("payload.html")), (self.project, self.audio(value=b"")), (json.dumps({"lyrics": [{"start": 4, "end": 2, "text": "bad"}]}), self.audio())]:
            with self.assertRaises(ValueError):
                storage.save_project(self.root, project, audio)
        self.assertEqual(list(self.root.iterdir()), [])

    def test_partial_write_failure_publishes_nothing(self):
        with patch.object(Path, "write_text", side_effect=OSError("disk full")):
            with self.assertRaises(OSError):
                storage.save_project(self.root, self.project, self.audio())
        self.assertEqual(list((self.root / "karaoke").iterdir()), [])


if __name__ == "__main__":
    unittest.main()
