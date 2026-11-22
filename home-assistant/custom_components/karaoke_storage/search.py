"""Authenticated search, local first, then bounded catalog requests."""
import asyncio
import time
from aiohttp import ClientError, ClientTimeout, web
from homeassistant.components.http import HomeAssistantView
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from .library import list_projects, media_directory
from .search_results import local_matches, catalog_matches


class KaraokeSearchView(HomeAssistantView):
    url = '/api/karaoke_storage/search'
    name = 'api:karaoke_storage:search'
    requires_auth = True

    def __init__(self, hass):
        self.hass = hass
        self.lock = asyncio.Lock()
        self.credentials = None
        self.cache = {}
        self.cooldowns = {}

    async def get(self, request):
        query = request.query.get('q', '').strip()
        if not 2 <= len(query) <= 160:
            raise web.HTTPBadRequest()
        _, root, subdirectory = media_directory(self.hass)
        projects = await self.hass.async_add_executor_job(list_projects, root, subdirectory)
        local = local_matches(projects, query)
        if local and request.query.get('catalog') != '1':
            return self.json({'results': local, 'messages': ['Projet trouvé dans Home Assistant.'], 'local': True}, headers={'Cache-Control': 'no-store'})
        async with self.lock:
            options = self.hass.data['karaoke_storage']
            account = options.get('spotify_account', 'auto')
            entries = self.hass.config_entries.async_entries('spotify')
            selected = next((entry for entry in entries if entry.entry_id == account), None) if account != 'auto' else entries[0] if len(entries) == 1 else None
            credentials = (account, selected.entry_id if selected else None)
            if credentials != self.credentials:
                self.credentials = credentials
                self.cache.clear()
            cached = self.cache.get(query.casefold())
            if cached and cached[0] > time.monotonic():
                return self.json(cached[1], headers={'Cache-Control': 'no-store'})
            session = async_get_clientsession(self.hass)
            messages = []

            async def fetch_json(source, url, **kwargs):
                if self.cooldowns.get(source, 0) > time.monotonic():
                    raise ValueError('Limite temporaire atteinte ; réessayez plus tard.')
                async with session.request(kwargs.pop('method', 'GET'), url, timeout=ClientTimeout(total=12), **kwargs) as response:
                    if response.status == 429:
                        try:
                            wait = max(30, float(response.headers.get('Retry-After', 60)))
                        except ValueError:
                            wait = 60
                        self.cooldowns[source] = time.monotonic() + wait
                        raise ValueError('Limite temporaire atteinte ; réessayez plus tard.')
                    if response.status != 200:
                        raise ValueError(f'Accès refusé ou service indisponible ({response.status}).')
                    return await response.json()

            async def spotify():
                if selected is None:
                    messages.append('Spotify non recherché : choisissez votre compte Spotify existant dans les paramètres de Karaoké.' if entries else 'Spotify non recherché : ajoutez ou reconnectez l’intégration Spotify de Home Assistant.')
                    return []
                try:
                    oauth = getattr(getattr(selected, 'runtime_data', None), 'session', None)
                    if oauth is None:
                        messages.append('Le compte Spotify sélectionné doit être chargé ou reconnecté dans Home Assistant.')
                        return []
                    try:
                        await oauth.async_ensure_token_valid()
                    except Exception:
                        messages.append('Reconnectez l’intégration Spotify dans Home Assistant pour rétablir la recherche.')
                        return []
                    data = await fetch_json('spotify', 'https://api.spotify.com/v1/search',
                                            params={'q': query, 'type': 'track', 'limit': 10}, headers={'Authorization': f"Bearer {oauth.token['access_token']}"})
                    return data.get('tracks', {}).get('items', [])
                except (ValueError, KeyError, TimeoutError, OSError, ClientError) as error:
                    messages.append(f'Spotify : {error}' if isinstance(error, ValueError) else 'Spotify indisponible. Réessayez plus tard.')
                    return []

            async def lrclib():
                try:
                    data = await fetch_json('lrclib', 'https://lrclib.net/api/search', params={'q': query},
                                            headers={'User-Agent': 'KaraokeStorage/1.7 (Home Assistant custom integration)'})
                    return data if isinstance(data, list) else []
                except (ValueError, TimeoutError, OSError, ClientError):
                    messages.append('LRCLIB indisponible ou limité. Réessayez plus tard.')
                    return []

            tracks, lyrics = await asyncio.gather(spotify(), lrclib())
            result = {'results': local + catalog_matches(tracks, lyrics, query), 'messages': messages, 'local': False}
            if len(self.cache) >= 30:
                self.cache.pop(next(iter(self.cache)))
            self.cache[query.casefold()] = (time.monotonic() + 60, result)
            return self.json(result, headers={'Cache-Control': 'no-store'})
