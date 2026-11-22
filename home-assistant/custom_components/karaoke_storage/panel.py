"""Native Home Assistant panel and authenticated widget settings."""
from pathlib import Path
from homeassistant.components.http import HomeAssistantView, StaticPathConfig
from homeassistant.components.panel_custom import async_register_panel
from homeassistant.components.frontend import add_extra_js_url
from homeassistant.helpers import entity_registry as er


async def async_setup_panel(hass, options):
    if not hass.data.get("karaoke_storage_assets_registered"):
        hass.http.register_view(KaraokeSettingsView(hass, options))
        await hass.http.async_register_static_paths([StaticPathConfig(
            "/karaoke_storage_assets", str(Path(__file__).parent / "frontend"), False)])
        add_extra_js_url(hass, "/karaoke_storage_assets/karaoke.js?v=1.7.1")
        hass.data["karaoke_storage_assets_registered"] = True
    await async_register_panel(hass, frontend_url_path="karaoke",
        webcomponent_name="karaoke-panel", sidebar_title="KaraokÃ©",
        sidebar_icon="mdi:microphone-variant",
        module_url="/karaoke_storage_assets/karaoke.js?v=1.7.1",
        embed_iframe=False)


class KaraokeSettingsView(HomeAssistantView):
    url = "/api/karaoke_storage/settings"
    name = "api:karaoke_storage:settings"
    requires_auth = True

    def __init__(self, hass, options):
        self.hass, self.settings = hass, options

    async def get(self, request):
        registry = er.async_get(self.hass)
        players = []
        for entry in registry.entities.values():
            if entry.domain != "media_player" or entry.platform != "cast" or entry.disabled_by:
                continue
            state = self.hass.states.get(entry.entity_id)
            players.append({"entity_id": entry.entity_id,
                "name": state.attributes.get("friendly_name", entry.entity_id) if state else entry.entity_id,
                "state": state.state if state else "unavailable"})
        return self.json({"app_url": self.settings.get("app_url", ""), "players": players})
