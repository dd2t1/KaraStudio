"""Saved songs as audio in the native browser; the panel launches karaoke."""
from homeassistant.components.media_player import BrowseError, MediaClass, MediaType
from homeassistant.components.media_source import BrowseMediaSource, MediaSource, PlayMedia, Unresolvable
from homeassistant.helpers import entity_registry as er
from .cast_url import receiver_url
from .library import list_projects, media_directory, read_project
from .playback import signed_path


async def async_get_media_source(hass):
    return KaraokeSource(hass)


class KaraokeSource(MediaSource):
    name = "Karaoké"

    def __init__(self, hass):
        super().__init__("karaoke_storage")
        self.hass = hass

    async def async_browse_media(self, item):
        if item.identifier:
            raise BrowseError("Dossier Karaoké inconnu.")
        try:
            _, root, subdirectory = media_directory(self.hass)
            projects = await self.hass.async_add_executor_job(list_projects, root, subdirectory)
        except (ValueError, OSError) as error:
            raise BrowseError("Impossible de lire la bibliothèque Karaoké.") from error
        return BrowseMediaSource(domain=self.domain, identifier=None,
            media_class=MediaClass.APP, media_content_type=MediaType.MUSIC,
            title="Karaoké", thumbnail="/karaoke_storage_assets/karaoke.svg",
            can_play=False, can_expand=True,
            children=[BrowseMediaSource(domain=self.domain, identifier=project["id"],
                media_class=MediaClass.MUSIC, media_content_type=project["mime_type"],
                title=project["title"],
                thumbnail="/karaoke_storage_assets/karaoke.svg",
                can_play=True, can_expand=False) for project in projects if project.get("source") != "spotify"])

    async def async_resolve_media(self, item):
        entry = er.async_get(self.hass).async_get(item.target_media_player) if item.target_media_player else None
        state = self.hass.states.get(item.target_media_player) if item.target_media_player else None
        cast_screen = (entry is not None and entry.platform == "cast" and state is not None
                       and state.attributes.get("device_class") != "speaker")
        # Preserve bookmarks to the shared-screen launcher.
        if item.identifier == "page":
            if not cast_screen:
                raise Unresolvable("Sélectionnez un écran Google Cast ou ouvrez /karaoke.")
            try:
                return PlayMedia(receiver_url(self.hass.data[self.domain].get("app_url")), "karaoke_storage_web")
            except ValueError as error:
                raise Unresolvable(str(error)) from error
        try:
            _, root, subdirectory = media_directory(self.hass)
            project = await self.hass.async_add_executor_job(read_project, root, subdirectory, item.identifier)
            if project.get("source") == "spotify":
                raise ValueError("Spotify requires the controller")
            return PlayMedia(signed_path(self.hass, item.identifier, "audio"), project["mime_type"])
        except (ValueError, OSError) as error:
            raise Unresolvable("Ce morceau Karaoké est absent ou incomplet.") from error
