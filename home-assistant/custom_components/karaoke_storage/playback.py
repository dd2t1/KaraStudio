"""Authenticated project and audio URLs, temporarily signed for receivers."""
from datetime import timedelta
from urllib.parse import urlencode
from aiohttp import web
from homeassistant.components.http import HomeAssistantView
from homeassistant.components.http.auth import async_sign_path
from homeassistant.helpers.network import get_url
from .library import list_projects, media_directory, read_project


def signed_path(hass, identifier, kind):
    return async_sign_path(hass, f"/api/karaoke_storage/projects/{identifier}/{kind}", timedelta(hours=4))


def project_receiver_url(hass, identifier):
    base = get_url(hass, prefer_external=True)
    fragment = urlencode({"project": signed_path(hass, identifier, "project"),
                          "audio": signed_path(hass, identifier, "audio")})
    return f"{base}/karaoke_storage_assets/receiver/index.html#{fragment}"


class KaraokeProjectView(HomeAssistantView):
    url = "/api/karaoke_storage/projects/{identifier}/{kind}"
    name = "api:karaoke_storage:project"
    requires_auth = True

    def __init__(self, hass):
        self.hass = hass

    async def get(self, request, identifier, kind):
        if kind not in ("project", "audio"):
            raise web.HTTPNotFound()
        try:
            _, root, subdirectory = media_directory(self.hass)
            item = await self.hass.async_add_executor_job(read_project, root, subdirectory, identifier)
        except (ValueError, OSError) as error:
            raise web.HTTPNotFound() from error
        headers = {"Cache-Control": "private, no-store"}
        if kind == "project":
            return self.json(item["project"], headers=headers)
        if item["audio"] is None:
            raise web.HTTPNotFound()
        return web.FileResponse(item["audio"], headers={**headers, "Content-Type": item["mime_type"]})


class KaraokeLibraryView(HomeAssistantView):
    url = "/api/karaoke_storage/projects"
    name = "api:karaoke_storage:projects"
    requires_auth = True

    def __init__(self, hass):
        self.hass = hass

    async def get(self, request):
        try:
            _, root, subdirectory = media_directory(self.hass)
            projects = await self.hass.async_add_executor_job(list_projects, root, subdirectory)
        except (ValueError, OSError) as error:
            raise web.HTTPServiceUnavailable() from error
        return self.json({"projects": [{"id": item["id"], "title": item["title"],
                                       "mime_type": item["mime_type"], "source": item.get("source", "audio")} for item in projects]},
                         headers={"Cache-Control": "no-store"})
