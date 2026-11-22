"""Filesystem persistence, independent of Home Assistant runtime."""
import json
import math
import re
from pathlib import Path
import shutil
import tempfile
from uuid import uuid4

MAX_AUDIO = 20 * 1024 * 1024
MAX_PROJECT = 2 * 1024 * 1024
AUDIO_EXTENSIONS = {".mp3", ".wav", ".ogg", ".flac", ".m4a", ".aac", ".opus", ".webm"}


def save_project(media_root, project, audio, subdirectory="karaoke"):
    """Validate everything before publishing a complete, uniquely named directory."""
    if not isinstance(project, str) or len(project.encode("utf-8")) > MAX_PROJECT:
        raise ValueError("Invalid project size")
    data = json.loads(project)
    if not isinstance(data, dict) or not isinstance(data.get("lyrics"), list) or not data["lyrics"]:
        raise ValueError("Missing lyrics")
    previous = -1
    for line in data["lyrics"]:
        if not isinstance(line, dict) or not isinstance(line.get("text"), str):
            raise ValueError("Invalid lyrics")
        start, end = line.get("start"), line.get("end")
        if any(isinstance(t, bool) or not isinstance(t, (float, int)) or not math.isfinite(t) for t in (start, end)):
            raise ValueError("Invalid timing")
        if start < 0 or end <= start or start < previous:
            raise ValueError("Invalid timing")
        previous = start
    if not isinstance(data.get("songInfo"), dict):
        data["songInfo"] = {}
    track = data["songInfo"].get("spotifyTrackId")
    if track is not None and (not isinstance(track, str) or not re.fullmatch(r"[A-Za-z0-9]{22}", track)):
        raise ValueError("Invalid Spotify track")
    audio_name, audio_bytes = None, None
    if track:
        if audio is not None:
            raise ValueError("Spotify project cannot contain audio")
    else:
        if audio is None:
            raise ValueError("Missing audio")
        extension = Path(audio.filename).suffix.lower()
        if extension not in AUDIO_EXTENSIONS:
            raise ValueError("Invalid audio format")
        audio_bytes = audio.file.read(MAX_AUDIO + 1)
        if not audio_bytes or len(audio_bytes) > MAX_AUDIO:
            raise ValueError("Invalid audio size")
        audio_name = f"musique{extension}"
    data["songInfo"]["audioFile"] = audio_name
    data["timingConvention"] = "line-start"
    # Reject non-standard JSON numbers (NaN/Infinity), including nested metadata.
    encoded = json.dumps(data, ensure_ascii=False, indent=2, allow_nan=False)
    root = Path(media_root).resolve()
    if subdirectory not in ("", "karaoke"):
        raise ValueError("Invalid storage subdirectory")
    folder = root / subdirectory
    if folder.is_symlink():
        raise ValueError("Invalid storage directory")
    folder.mkdir(parents=True, exist_ok=True)
    identifier = uuid4().hex
    staging = Path(tempfile.mkdtemp(prefix=".upload-", dir=folder))
    try:
        if audio_name:
            (staging / audio_name).write_bytes(audio_bytes)
        (staging / "niveau.json").write_text(encoded, encoding="utf-8")
        staging.rename(folder / identifier)
    finally:
        if staging.exists():
            shutil.rmtree(staging)
    return "/".join(part for part in (subdirectory, identifier, audio_name or "niveau.json") if part)

