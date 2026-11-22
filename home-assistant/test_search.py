"""Search evidence tests without a running Home Assistant."""
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('search_results', Path(__file__).parent / 'custom_components/karaoke_storage/search_results.py')
search = importlib.util.module_from_spec(spec)
spec.loader.exec_module(search)


class SearchTests(unittest.TestCase):
    def test_local_matches_accents_and_all_terms(self):
        projects = [{'id': 'a' * 32, 'title': 'Été — Chanteur', 'source': 'spotify', 'project': {'songInfo': {'spotifyTrackId': 'x' * 22}}}]
        result = search.local_matches(projects, 'ete chanteur')
        self.assertEqual(result[0]['project_id'], 'a' * 32)
        self.assertIn('Projet existant', result[0]['badges'])
        self.assertEqual(search.local_matches(projects, 'ete inconnu'), [])

    def test_merges_only_matching_artist_title_and_recording_duration(self):
        track = {'id': 'x' * 22, 'name': 'Été', 'duration_ms': 180000, 'artists': [{'name': 'Chanteur'}]}
        lyrics = {'id': 1, 'trackName': 'Été', 'artistName': 'Chanteur', 'duration': 181, 'syncedLyrics': '[00:01.00] Paroles'}
        results = search.catalog_matches([track], [lyrics])
        self.assertEqual(len(results), 1)
        self.assertIn('Paroles synchronisées', results[0]['badges'])
        for mismatch in [{'duration': 190}, {'artistName': 'Autre'}, {'trackName': 'Été (live)'}]:
            results = search.catalog_matches([track], [{**lyrics, **mismatch}])
            self.assertIsNone(results[0]['lyrics_id'])
            self.assertIn('Paroles non trouvées', results[0]['badges'])
            self.assertEqual(len(results), 2)

    def test_unsynced_is_not_badged_as_synced(self):
        results = search.catalog_matches([], [{'id': 2, 'trackName': 'Titre', 'plainLyrics': 'Texte'}])
        self.assertEqual(results[0]['badges'], ['LRCLIB', 'Paroles seules'])
