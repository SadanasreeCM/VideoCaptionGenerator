# Video Caption Generator

A full-stack app for automatic transcription, translation, and live caption preview on video.

## Stack
- Frontend: React + Vite
- Backend: Node.js + Express
- Auth: Email/Password + Google OAuth (optional)
- Captions: Local Whisper (recommended) or Google Cloud Speech-to-Text + Translate

## Quick Start

### 1) Backend

```
cd backend
npm install
cp .env.example .env
npm run dev
```

### 2) Frontend

```
cd frontend
npm install
npm run dev
```

Open the Vite dev server URL (usually http://localhost:5173).

## Environment

### Local Whisper (no cloud account)

1) Install Python deps:
```
pip install faster-whisper
pip install argostranslate
```

2) (Optional) Install Argos language packs:
```
python -m argostranslate.cli --help
```

3) In `backend/.env`:
```
LOCAL_TRANSCRIBE=1
LOCAL_TRANSLATE=1
WHISPER_MODEL=base
PYTHON_PATH=python
```

### Video URLs (YouTube / Instagram)

To enable captioning from pasted URLs, install `yt-dlp` and ensure it is on your PATH (or set `YTDLP_PATH` in `backend/.env`).

### Google Cloud (optional)

Configure Google Cloud credentials and OAuth keys in `backend/.env`.
You can use a service account JSON file and set `GOOGLE_APPLICATION_CREDENTIALS`.

## Notes
- Captioning uses FFmpeg for audio extraction. `ffmpeg-static` is included, so no global install needed.
- For production, use a real DB instead of SQLite and store tokens securely.
