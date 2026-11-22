"""Combine catalog evidence without guessing that different recordings match."""
import unicodedata


def normalized(value):
    return ''.join(c for c in unicodedata.normalize('NFKD', str(value)).casefold() if c.isalnum())


def local_matches(projects, query):
    terms = [normalized(term) for term in query.split()]
    return [{"project_id": item['id'], "title": item['title'], "artist": '',
             "spotify_id": item['project'].get('songInfo', {}).get('spotifyTrackId'),
             "badges": ['Projet existant', 'Paroles synchronisées'] + (['Spotify'] if item.get('source') == 'spotify' else ['Audio local'])}
            for item in projects if all(term in normalized(item['title']) for term in terms)][:20]


def catalog_matches(tracks, lyrics, query=""):
    terms = [normalized(term) for term in query.split() if normalized(term)]
    results, used = [], set()
    for track in tracks[:10]:
        artist = ', '.join(item['name'] for item in track.get('artists', []))
        matches = [item for item in lyrics if (item.get('syncedLyrics') or item.get('plainLyrics')) and normalized(item.get('trackName')) == normalized(track.get('name'))
                   and normalized(item.get('artistName')) in {normalized(a.get('name')) for a in track.get('artists', [])}
                   and abs(float(item.get('duration') or 0) - track.get('duration_ms', 0) / 1000) <= 2]
        match = min(matches, key=lambda item: (not bool(item.get('syncedLyrics')), abs(float(item.get('duration') or 0) - track.get('duration_ms', 0) / 1000)), default=None)
        badges = ['Spotify']
        if match:
            used.add(match['id'])
            badges.append('Paroles synchronisées' if match.get('syncedLyrics') else 'Paroles seules')
        else:
            badges.append('Paroles non trouvées')
        results.append({'title': track['name'], 'artist': artist, 'spotify_id': track['id'],
                        'lyrics_id': match['id'] if match else None, 'badges': badges})
    for item in lyrics[:20]:
        if item.get('id') in used or not (item.get('plainLyrics') or item.get('syncedLyrics')):
            continue
        results.append({'title': item.get('trackName', ''), 'artist': item.get('artistName', ''),
                        'lyrics_id': item['id'], 'badges': ['LRCLIB', 'Paroles synchronisées' if item.get('syncedLyrics') else 'Paroles seules']})
    def rank(item):
        haystack = normalized(item.get('title', '') + ' ' + item.get('artist', ''))
        query_match = normalized(query) in haystack if query else False
        coverage = sum(term in haystack for term in terms)
        return (-int(query_match), -coverage, -int('Paroles synchronisées' in item['badges']))
    if query:
        results.sort(key=rank)
    return results[:30]
