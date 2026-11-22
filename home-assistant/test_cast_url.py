import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("cast_url", Path(__file__).parent / "custom_components/karaoke_storage/cast_url.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class CastUrlTests(unittest.TestCase):
    def test_receiver_keeps_room_but_never_presenter_secret(self):
        url = module.receiver_url('https://example.test/dev/?room=abc#presenter=secret')
        self.assertEqual(url, 'https://example.test/dev/?room=abc&cast=1')

    def test_network_addresses_and_future_docker_url(self):
        for url in ("http://192.168.0.5:3000/", "https://karaoke.example.test/play?project=123#screen", "http://[fd00::5]:3000/"):
            self.assertEqual(module.validate_page_url(url), url)

    def test_unusable_or_credentialed_addresses(self):
        for url in (None, "", "file:///tmp/page", "javascript:alert(1)", "http://localhost:5173", "http://127.0.0.1", "http://[::1]", "http://0.0.0.0:3000", "http://user:password@example.test", "http://example.test:99999", "http://example.test/a b"):
            with self.subTest(url=url), self.assertRaises(ValueError):
                module.validate_page_url(url)
