"""Visual setup and options for the karaoke library."""
import voluptuous as vol
from homeassistant import config_entries
from homeassistant.core import callback
from homeassistant.helpers import selector
from .cast_url import validate_page_url

DOMAIN = "karaoke_storage"


def settings_schema(hass, values):
    directories = list(hass.config.media_dirs)
    discovered = [item for group in hass.data.get("karaoke_storage_discovered", {}).values() for item in group]
    urls = list(dict.fromkeys(item["url"] for item in discovered))
    spotify_accounts = [{"value": "auto", "label": "Automatique (un seul compte Spotify)"}] + [
        {"value": entry.entry_id, "label": entry.title} for entry in hass.config_entries.async_entries('spotify')]
    return vol.Schema({
        vol.Optional('spotify_account', default=values.get('spotify_account', 'auto')): selector.SelectSelector(selector.SelectSelectorConfig(options=spotify_accounts, mode=selector.SelectSelectorMode.DROPDOWN)),
        vol.Optional("app_url", default=values.get("app_url", "")): selector.SelectSelector(
            selector.SelectSelectorConfig(options=urls, custom_value=True, mode=selector.SelectSelectorMode.DROPDOWN)),
        vol.Required("media_directory", default=values.get("media_directory", "local" if "local" in directories else next(iter(directories), ""))):
            selector.SelectSelector(selector.SelectSelectorConfig(options=directories)),
        vol.Required("project_subdirectory", default=values.get("project_subdirectory", "karaoke") or "root"):
            selector.SelectSelector(selector.SelectSelectorConfig(options=[
                {"value": "root", "label": "Racine du dossier média / Media folder root"},
                {"value": "karaoke", "label": "Sous-dossier karaoke / karaoke subfolder"},
            ])),
    })


def validate_settings(hass, values):
    data = dict(values)
    # A required HA selector treats an empty string as an unanswered field.
    # Keep the existing on-disk convention while submitting a nonempty choice.
    if data.get('project_subdirectory') == 'root':
        data['project_subdirectory'] = ''
    errors = {}
    if data.get("media_directory") not in hass.config.media_dirs:
        errors["media_directory"] = "invalid_directory"
    if data.get("project_subdirectory") not in ("", "karaoke"):
        errors["project_subdirectory"] = "invalid_directory"
    try:
        data["app_url"] = validate_page_url(data["app_url"]) if data.get("app_url", "").strip() else ""
    except ValueError:
        errors["app_url"] = "invalid_url"
    return data, errors


class KaraokeConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    VERSION = 1

    async def async_step_user(self, user_input=None):
        await self.async_set_unique_id(DOMAIN)
        self._abort_if_unique_id_configured()
        errors = {}
        if user_input is not None:
            data, errors = validate_settings(self.hass, user_input)
            if not errors:
                return self.async_create_entry(title="Karaoké", data=data)
        return self.async_show_form(step_id="user", data_schema=settings_schema(self.hass, user_input or {}), errors=errors)

    async def async_step_import(self, user_input):
        """One-time migration of existing YAML and the old panel's saved URL."""
        await self.async_set_unique_id(DOMAIN)
        self._abort_if_unique_id_configured()
        directories = self.hass.config.media_dirs
        values = {"app_url": "", "media_directory": "local" if "local" in directories else next(iter(directories), ""),
                  "project_subdirectory": "karaoke", **user_input}
        data, errors = validate_settings(self.hass, values)
        if errors:
            return self.async_abort(reason="invalid_import")
        return self.async_create_entry(title="Karaoké", data=data)

    @staticmethod
    @callback
    def async_get_options_flow(config_entry):
        return KaraokeOptionsFlow()


class KaraokeOptionsFlow(config_entries.OptionsFlow):
    async def async_step_init(self, user_input=None):
        errors = {}
        if user_input is not None:
            data, errors = validate_settings(self.hass, user_input)
            if not errors:
                return self.async_create_entry(data=data)
        values = {**self.config_entry.data, **self.config_entry.options, **(user_input or {})}
        return self.async_show_form(step_id="init", data_schema=settings_schema(self.hass, values), errors=errors)
