"""Store a karaoke JSON and its audio together in Home Assistant's media directory."""
from aiohttp import web
from aiohttp.web_request import FileField
import voluptuous as vol

from homeassistant.components.http import HomeAssistantView, require_admin
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import config_validation as cv, entity_registry as er
from homeassistant.config_entries import SOURCE_IMPORT
from homeassistant.helpers.storage import Store
from homeassistant.components.frontend import async_remove_panel
from .discovery import async_start_discovery

from .cast_url import validate_page_url, receiver_url
from .panel import async_setup_panel
from .playback import KaraokeProjectView, KaraokeLibraryView, project_receiver_url, signed_path
from .library import media_directory, read_project
from .search import KaraokeSearchView

DOMAIN = "karaoke_storage"
from .storage import MAX_AUDIO, MAX_PROJECT, save_project

CONFIG_SCHEMA = vol.Schema({DOMAIN: vol.Any(None, vol.Schema({
    vol.Optional("media_directory"): str,
    vol.Optional("project_subdirectory", default="karaoke"): vol.In(("", "karaoke")),
    vol.Optional("app_url"): validate_page_url,
}))}, extra=vol.ALLOW_EXTRA)


async def async_setup(hass, config):
    """Import legacy settings once; new installations use the visual flow."""
    await async_start_discovery(hass)
    if DOMAIN in config:
        options = dict(config.get(DOMAIN) or {})
        saved = await Store(hass, 1, "karaoke_storage.settings").async_load()
        if saved and saved.get("app_url"):
            options["app_url"] = saved["app_url"]
        hass.async_create_task(hass.config_entries.flow.async_init(
            DOMAIN, context={"source": SOURCE_IMPORT}, data=options))
    return True


async def async_update_options(hass, entry):
    options = hass.data.setdefault(DOMAIN, {})
    options.clear()
    options.update({**entry.data, **entry.options})


async def async_setup_entry(hass, entry):
    await async_update_options(hass, entry)
    options = hass.data[DOMAIN]
    if not hass.data.get("karaoke_storage_views_registered"):
        hass.http.register_view(KaraokeStorageView(hass))
        hass.http.register_view(KaraokeProjectView(hass))
        hass.http.register_view(KaraokeLibraryView(hass))
        hass.http.register_view(KaraokeSearchView(hass))
        hass.data["karaoke_storage_views_registered"] = True
    await async_setup_panel(hass, options)
    entry.async_on_unload(entry.add_update_listener(async_update_options))

    async def cast_page(call):
        entity_id = call.data["entity_id"]
        entity = er.async_get(hass).async_get(entity_id)
        if entity is None or entity.platform != "cast":
            raise HomeAssistantError("Sélectionnez un appareil de l’intégration Google Cast.")
        state = hass.states.get(entity_id)
        if state is None or state.state in ("unavailable", "unknown"):
            raise HomeAssistantError("Cet écran est indisponible. Allumez-le et vérifiez sa connexion réseau.")
        try:
            url = receiver_url(call.data.get("url") or options.get("app_url"))
        except ValueError as error:
            raise HomeAssistantError(str(error)) from error
        await hass.services.async_call("media_player", "play_media", {
            "entity_id": entity_id,
            "media_content_type": "karaoke_storage_web",
            "media_content_id": url,
        }, blocking=True, context=call.context)

    hass.services.async_register(DOMAIN, "cast_page", cast_page, schema=vol.Schema({
        vol.Required("entity_id"): cv.entity_id,
        vol.Optional("url"): validate_page_url,
    }))

    async def play_project(call):
        entity_id = call.data["entity_id"]
        state = hass.states.get(entity_id)
        if state is None or state.state in ("unavailable", "unknown"):
            raise HomeAssistantError("Cet appareil est indisponible.")
        entry = er.async_get(hass).async_get(entity_id)
        try:
            _, root, subdirectory = media_directory(hass)
            project = await hass.async_add_executor_job(read_project, root, subdirectory, call.data["project_id"])
            if project.get("source") == "spotify":
                raise HomeAssistantError("Ouvrez ce projet Spotify dans l’application Karaoké, puis utilisez Caster la page avec le lecteur de contrôle ouvert.")
            screen = entry is not None and entry.platform == "cast" and state.attributes.get("device_class") != "speaker"
            url = project_receiver_url(hass, project["id"]) if screen else signed_path(hass, project["id"], "audio")
        except (ValueError, OSError) as error:
            raise HomeAssistantError("Ce morceau est absent ou incomplet.") from error
        await hass.services.async_call("media_player", "play_media", {
            "entity_id": entity_id, "media_content_id": url,
            "media_content_type": "karaoke_storage_web" if screen else project["mime_type"],
        }, blocking=True, context=call.context)

    hass.services.async_register(DOMAIN, "play_project", play_project, schema=vol.Schema({
        vol.Required("entity_id"): cv.entity_domain("media_player"),
        vol.Required("project_id"): vol.Match(r"^[a-f0-9]{32}$"),
    }))
    return True


async def async_unload_entry(hass, entry):
    hass.services.async_remove(DOMAIN, "cast_page")
    hass.services.async_remove(DOMAIN, "play_project")
    async_remove_panel(hass, "karaoke")
    hass.data[DOMAIN].clear()
    hass.data[DOMAIN]["media_directory"] = "__disabled__"
    return True




class KaraokeStorageView(HomeAssistantView):
    url = "/api/karaoke_storage"
    name = "api:karaoke_storage"
    requires_auth = True

    def __init__(self, hass, media_directory=None):
        self.hass = hass
        self.directory_key = media_directory

    def media_directory(self):
        directories = self.hass.config.media_dirs
        if not directories:
            raise web.HTTPServiceUnavailable()
        key = self.hass.data[DOMAIN].get("media_directory") or ("local" if "local" in directories else next(iter(directories)))
        if key not in directories:
            raise web.HTTPServiceUnavailable()
        return key, directories[key]

    @require_admin
    async def get(self, request):
        self.media_directory()
        return self.json({"integration": DOMAIN, "version": 1})

    @require_admin
    async def post(self, request):
        source, directory = self.media_directory()
        request._client_max_size = MAX_AUDIO + MAX_PROJECT + 64 * 1024
        if request.content_type != "multipart/form-data":
            raise web.HTTPBadRequest()
        try:
            form = await request.post()
            if set(form) not in ({"project"}, {"project", "audio"}) or len(form) != len(set(form)) or ("audio" in form and not isinstance(form["audio"], FileField)):
                raise ValueError("Expected a project and audio")
            relative = await self.hass.async_add_executor_job(save_project, directory, form["project"], form.get("audio"), self.hass.data[DOMAIN].get("project_subdirectory", "karaoke"))
        except (ValueError, TypeError, OverflowError) as error:
            raise web.HTTPBadRequest() from error
        except OSError as error:
            raise web.HTTPServiceUnavailable() from error
        return self.json({"media_content_id": f"media-source://media_source/{source}/{relative}"}, status_code=201)
