"""Home Assistant Cast platform for opening the karaoke website with DashCast."""
import asyncio
from threading import Event

from pychromecast.controllers.dashcast import DashCastController
from homeassistant.exceptions import HomeAssistantError

from .cast_url import validate_page_url

MEDIA_TYPE = "karaoke_storage_web"


async def async_get_media_browser_root_object(hass, cast_type):
    return []


async def async_browse_media(hass, media_content_type, media_content_id, cast_type):
    return None


def launch_page(chromecast, url):
    """Wait for Cast acknowledgement, not a claim that the website rendered."""
    controller = DashCastController()
    complete = Event()
    accepted = False

    def callback(success, response):
        nonlocal accepted
        accepted = success
        complete.set()

    chromecast.register_handler(controller)
    try:
        controller.load_url(url, force=True, callback_function=callback)
        if not complete.wait(30):
            raise HomeAssistantError("Le Chromecast n’a pas confirmé le lancement sous 30 secondes.")
        if not accepted:
            raise HomeAssistantError("Le Chromecast a refusé le lancement de DashCast.")
    finally:
        chromecast.unregister_handler(controller)


async def async_play_media(hass, cast_entity_id, chromecast, media_type, media_id):
    if media_type != MEDIA_TYPE:
        return False
    try:
        url = validate_page_url(media_id)
    except ValueError as error:
        raise HomeAssistantError(str(error)) from error
    if chromecast.cast_info.cast_type != "cast":
        raise HomeAssistantError("Choisissez un Chromecast ou Google TV avec écran, pas une enceinte ou un groupe audio.")
    locks = hass.data.setdefault("karaoke_storage_cast_locks", {})
    lock = locks.setdefault(cast_entity_id, asyncio.Lock())
    async with lock:
        await hass.async_add_executor_job(launch_page, chromecast, url)
    return True
