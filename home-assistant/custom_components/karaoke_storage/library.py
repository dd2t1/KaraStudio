"""Read complete saved projects without exposing unrelated media files."""
import json
import re
from pathlib import Path
from .storage import AUDIO_EXTENSIONS, MAX_PROJECT

MIME_TYPES = {".mp3": "audio/mpeg", ".wav": "audio/wav", ".ogg": "audio/ogg",
              ".flac": "audio/flac", ".m4a": "audio/mp4", ".aac": "audio/aac",
              ".opus": "audio/ogg", ".webm": "audio/webm"}


def media_directory(hass):
    options = hass.data["karaoke_storage"]
    directories = hass.config.media_dirs
    key = options.get("media_directory") or ("local" if "local" in directories else next(iter(directories), None))
    if key not in directories:
        raise ValueError("Aucun dossier média Karaoké configuré.")
    return key, Path(directories[key]), options.get("project_subdirectory", "karaoke")


def read_project(root, subdirectory, identifier):
    if not isinstance(identifier, str) or not re.fullmatch(r"[a-f0-9]{32}", identifier):
        raise ValueError("Identifiant Karaoké invalide.")
    folder = Path(root) / subdirectory
    directory = folder / identifier
    project = directory / "niveau.json"
    if folder.is_symlink() or directory.is_symlink() or project.is_symlink():
        raise ValueError("Projet inaccessible.")
    if project.stat().st_size > MAX_PROJECT:
        raise ValueError("Projet trop volumineux.")
    data = json.loads(project.read_text(encoding="utf-8"))
    if not isinstance(data, dict) or not isinstance(data.get("lyrics"), list) or not data["lyrics"]:
        raise ValueError("Projet sans paroles.")
    info = data.get("songInfo")
    if not isinstance(info, dict):
        raise ValueError("Métadonnées invalides.")
    audio_name = info.get("audioFile", "")
    track = info.get("spotifyTrackId")
    if track is not None:
        if not isinstance(track, str) or not re.fullmatch(r"[A-Za-z0-9]{22}", track) or audio_name:
            raise ValueError("Projet Spotify invalide.")
        return {"id": identifier, "title": str(info.get("title") or "Karaoké Spotify"),
                "project": data, "audio": None, "mime_type": None, "source": "spotify"}
    if audio_name not in {f"musique{ext}" for ext in AUDIO_EXTENSIONS}:
        raise ValueError("Fichier audio invalide.")
    audio = directory / audio_name
    if audio.is_symlink() or not audio.is_file() or audio.stat().st_size == 0:
        raise ValueError("Fichier audio manquant.")
    title = str(info.get("title") or "Karaoké")
    artist = str(info.get("artist") or "")
    return {"id": identifier, "title": f"{title} — {artist}" if artist else title,
            "project": data, "audio": audio, "mime_type": MIME_TYPES[audio.suffix]}


def list_projects(root, subdirectory):
    folder = Path(root) / subdirectory
    if not folder.exists() or folder.is_symlink():
        return []
    result = []
    for directory in folder.iterdir():
        try:
            result.append(read_project(root, subdirectory, directory.name))
        except (ValueError, OSError):
            continue
    return sorted(result, key=lambda item: (item["title"].casefold(), item["id"]))
