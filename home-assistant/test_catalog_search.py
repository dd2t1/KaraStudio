import asyncio
import importlib.util
from pathlib import Path
import sys
from types import ModuleType, SimpleNamespace as NS
import unittest
from unittest.mock import patch, AsyncMock


def module(name, **values):
    result = ModuleType(name)
    result.__dict__.update(values)
    return result


class View:
    def json(self, data, **kwargs):
        return data


folder = Path(__file__).parent / 'custom_components/karaoke_storage'
package = module('search_test_package', __path__=[str(folder)])
stubs = {
    'search_test_package': package,
    'homeassistant.components.http': module('homeassistant.components.http', HomeAssistantView=View),
    'homeassistant.helpers.aiohttp_client': module('homeassistant.helpers.aiohttp_client', async_get_clientsession=lambda hass: hass.session),
}
with patch.dict(sys.modules, stubs):
    spec = importlib.util.spec_from_file_location('search_test_package.search', folder / 'search.py')
    search = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(search)


class Response:
    def __init__(self, data, status=200):
        self.data, self.status, self.headers = data, status, {'Retry-After': '60'}
    async def __aenter__(self):
        return self
    async def __aexit__(self, *args):
        pass
    async def json(self):
        return self.data


class Session:
    def __init__(self):
        self.calls = []
        self.spotify_status = 200
    def request(self, method, url, **kwargs):
        self.calls.append(url)
        if 'api/token' in url:
            return Response({'access_token': 'private-token', 'expires_in': 3600})
        if 'spotify.com' in url:
            return Response({'tracks': {'items': []}}, self.spotify_status)
        return Response([{'id': 12, 'trackName': 'Titre', 'plainLyrics': 'Paroles'}])


class CatalogSearchTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        async def executor(function, *args):
            return self.projects
        self.projects = []
        self.entries = []
        self.hass = NS(data={'karaoke_storage': {}}, config_entries=NS(async_entries=lambda domain: self.entries), session=Session(), async_add_executor_job=executor)
        self.view = search.KaraokeSearchView(self.hass)
        self.patcher = patch.object(search, 'media_directory', return_value=('local', '/media', 'karaoke'))
        self.patcher.start()
        self.addCleanup(self.patcher.stop)

    async def test_local_result_skips_both_external_services(self):
        self.projects = [{'id': 'a' * 32, 'title': 'Titre', 'project': {}}]
        result = await self.view.get(NS(query={'q': 'Titre'}))
        self.assertTrue(result['local'])
        self.assertEqual(self.hass.session.calls, [])

    async def test_missing_spotify_credentials_preserves_lrclib_and_cache(self):
        result = await self.view.get(NS(query={'q': 'Titre'}))
        self.assertIn('Paroles seules', result['results'][0]['badges'])
        self.assertIn('Spotify non recherché', result['messages'][0])
        await self.view.get(NS(query={'q': 'Titre'}))
        self.assertEqual(len(self.hass.session.calls), 1)

    async def test_rate_limit_stops_spotify_requests_and_does_not_expose_secret(self):
        oauth = NS(token={'access_token': 'private-token'}, async_ensure_token_valid=AsyncMock())
        self.entries = [NS(entry_id='existing-account', runtime_data=NS(session=oauth))]
        self.hass.session.spotify_status = 429
        result = await self.view.get(NS(query={'q': 'Titre'}))
        self.assertTrue(result['results'])
        self.assertNotIn('private-', repr(result))
        await self.view.get(NS(query={'q': 'Autre titre'}))
        self.assertEqual(sum('api.spotify.com' in url for url in self.hass.session.calls), 1)
        self.assertFalse(any('api/token' in url for url in self.hass.session.calls))

    async def test_multiple_accounts_require_explicit_choice(self):
        self.entries = [NS(entry_id='one'), NS(entry_id='two')]
        result = await self.view.get(NS(query={'q': 'Titre'}))
        self.assertIn('choisissez votre compte', result['messages'][0])
        self.assertFalse(any('spotify.com' in url for url in self.hass.session.calls))
