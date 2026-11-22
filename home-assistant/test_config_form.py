"""Verify the form/storage boundary without requiring HA's runtime."""
import ast
from pathlib import Path
from types import SimpleNamespace as NS
import unittest


class Field:
    def __init__(self, name, default=None):
        self.name, self.default = name, default


source = (Path(__file__).parent / 'custom_components/karaoke_storage/config_flow.py').read_text(encoding='utf-8')
tree = ast.parse(source)
functions = ast.Module(body=[node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name in ('settings_schema', 'validate_settings')], type_ignores=[])
namespace = {
    'vol': NS(Schema=lambda data: data, Required=Field, Optional=Field),
    'selector': NS(SelectSelector=lambda value: value, SelectSelectorConfig=lambda **kwargs: kwargs,
                   SelectSelectorMode=NS(DROPDOWN='dropdown'), TextSelector=lambda value: value,
                   TextSelectorConfig=lambda **kwargs: kwargs, TextSelectorType=NS(PASSWORD='password')),
    'validate_page_url': lambda value: value,
}
exec(compile(functions, '<config form functions>', 'exec'), namespace)


class ConfigFormTests(unittest.TestCase):
    def setUp(self):
        self.hass = NS(config=NS(media_dirs={'karaoke': '/media/karaoke'}), data={}, config_entries=NS(async_entries=lambda domain: [NS(entry_id='spotify-one', title='Mon Spotify')]))

    def test_root_choice_is_nonempty_and_still_uses_original_storage_folder(self):
        schema = namespace['settings_schema'](self.hass, {'project_subdirectory': ''})
        field = next(field for field in schema if field.name == 'project_subdirectory')
        self.assertEqual(field.default, 'root')
        self.assertTrue(all(option['value'] for option in schema[field]['options']))
        settings, errors = namespace['validate_settings'](self.hass, {'media_directory': 'karaoke', 'project_subdirectory': 'root'})
        self.assertEqual(errors, {})
        self.assertEqual(settings['project_subdirectory'], '')

    def test_existing_storage_values_remain_compatible(self):
        for value in ('', 'karaoke'):
            settings, errors = namespace['validate_settings'](self.hass, {'media_directory': 'karaoke', 'project_subdirectory': value})
            self.assertEqual(errors, {})
            self.assertEqual(settings['project_subdirectory'], value)

    def test_existing_spotify_account_is_selectable_without_credentials(self):
        schema = namespace['settings_schema'](self.hass, {})
        fields = {field.name: schema[field] for field in schema}
        self.assertNotIn('spotify_client_secret', fields)
        self.assertEqual(fields['spotify_account']['options'][1], {'value': 'spotify-one', 'label': 'Mon Spotify'})
