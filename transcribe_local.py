"""Transcription locale Whisper avec timestamps de segments et de mots."""

from __future__ import annotations

import json
import os
import sys

# Le serveur Node lit la sortie du processus comme UTF-8 ; sans cela, Windows
# peut convertir les paroles françaises selon la page de codes de la console.
sys.stdout.reconfigure(encoding="utf-8")

# CTranslate2 charge cuBLAS/cuDNN au démarrage. Les DLL sont isolées dans le
# projet pour éviter une installation CUDA globale sur Windows.
cuda_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".tools", "cuda12")
if os.path.isdir(cuda_dir):
    os.add_dll_directory(cuda_dir)
    os.environ["PATH"] = f"{cuda_dir}{os.pathsep}{os.environ.get('PATH', '')}"

from faster_whisper import WhisperModel


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("Usage: transcribe_local.py <fichier-audio>")

    model_name = os.environ.get("LOCAL_WHISPER_MODEL", "large-v3")
    model = WhisperModel(model_name, device="cuda", compute_type="int8_float16")
    segments, info = model.transcribe(
        sys.argv[1],
        beam_size=5,
        word_timestamps=True,
        # Le détecteur de parole peut supprimer des passages chantés sur une
        # musique. Conserver l'audio complet par défaut pour le karaoké.
        vad_filter=os.environ.get("LOCAL_WHISPER_VAD", "false").lower() == "true",
    )
    result = []
    for segment in segments:
        result.append({
            "start": segment.start,
            "end": segment.end,
            "text": segment.text,
            "words": [
                {"start": word.start, "end": word.end, "word": word.word}
                for word in (segment.words or [])
            ],
        })

    print(json.dumps({
        "language": info.language,
        "duration": info.duration,
        "duration_after_vad": info.duration_after_vad,
        "segments": result,
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
