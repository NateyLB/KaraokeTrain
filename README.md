# KaraokeTrain

The native Swift continuation, verification commands and current parity gaps are documented in [ios/README.md](ios/README.md). Shared API and hosting exploration is in [docs/SHARED_BACKEND_PLAN.md](docs/SHARED_BACKEND_PLAN.md).

## Local song processing

New songs require FFmpeg and a Python environment with Demucs and faster-whisper. Cached songs use their saved audio and lyrics directly.

On macOS, install the tools and the project environment:

```bash
brew install python@3.11 ffmpeg yt-dlp
npm ci
npm run setup:processing
gcloud auth application-default login
```

Set these non-secret values in `.env.local`, alongside the project's API keys and downloader secret:

```dotenv
STORAGE_MODE=gcs
GCS_BUCKET_NAME=your-bucket-name
DOWNLOADER_API_URL=http://localhost:4000
PYTHON_BIN_PATH=venv/bin/python3
TORCH_HOME=./models/torch
HF_HOME=./models/huggingface
ASR_PYTHON_BIN_PATH=venv-asr/bin/python3
LYRICS_ASR_PROVIDER=qwen
```

Start `npm run downloader` and `npm run dev` in separate terminals. The first new-song job downloads the processing model weights. The environment, downloaded models, and temporary song files are ignored by Git.

Run `npm run setup:asr` to install Qwen's separate transcription environment. New lyrics use `Qwen/Qwen3-ASR-1.7B` and `Qwen/Qwen3-ForcedAligner-0.6B`; their weights download on first use. CUDA, Apple Metal (MPS), and CPU are selected automatically. `ASR_DEVICE` can override the device, and `QWEN_ASR_MODEL` can select the smaller `Qwen/Qwen3-ASR-0.6B` model if needed. Demucs keeps its original environment.

LRCLIB candidates must match both song and artist. They are checked against an independent transcription before display. Alignment uses the actual performance's word times, including live versions, rather than shifting studio timestamps. Rejected candidates fall back to the transcription. Generated phonetic versions inherit timing only from their validated original.

Qwen text receives a separate Whisper Large v3 Turbo word-timing check, with monotonic alignment constrained by audio time. Vocal-energy refinement extends held notes while respecting silence and the next word. The text is unchanged, and timing evidence is cached for reuse. This adds a timing pass for new songs; cached playback still uses saved results.

The rolling display keeps line layout stable, uses the media clock for highlighting, snaps to position when seeking, and previews upcoming vocals during instrumental gaps. It respects reduced-motion preferences.

Processed songs save lyrics metadata and an independent `transcription.json` in GCS. Cached playback fetches saved results directly. `POST /api/lyrics/sync` with `{ "jobId": "<videoId>" }` explicitly repairs a song; it resolves lyrics on the server, reuses a compatible transcript, or extracts vocals from the saved multiplex audio without repeating Demucs. Connected rooms receive the correction over SSE without resetting playback.

Set `LYRICS_ASR_PROVIDER=whisper` to use the optional Whisper Large v3 Turbo backend in the processing environment. It checks word confidence and can compare the original mix when isolated vocals are unclear. The Qwen backend does not report calibrated word probabilities, so those are not presented as accuracy scores.

Run `npm run test:downloader`, `npm run test:playback`, and `npm run test:lyrics` for the service, playback, matching, and alignment regression checks.

For a deployed app, the downloader URL must point to the tunnel's actual public hostname. A quick `trycloudflare.com` tunnel does not automatically connect a custom hostname.

## Code organization and checks

Use Node 22.12 or newer. Next.js 16.4 uses the supported webpack builder in this project because runtime storage paths trigger Turbopack's filesystem tracing issue.

| Directory | Responsibility |
| --- | --- |
| `app/` | Routes and page composition |
| `components/` | Reusable client views; room and queue components are grouped by feature |
| `hooks/` | React state bridges, subscriptions and browser lifetimes |
| `lib/audio/` | Owned audio graphs and media helpers |
| `lib/lyrics/` | Candidate matching, transcription, alignment and timing |
| `lib/party/` | Room protocol, settings and state |
| `lib/processing/` | Bounded work scheduling and song processing |
| `lib/storage/` | Local/GCS repository and metadata persistence |
| `lib/search/`, `lib/http/` | Search adapters and shared request validation |
| `tests/` | Automated regressions |

Run `npm run lint`, `npm test`, `npm run build`, and `npm audit --omit=dev`. `npm run test:processing` runs focused resource, scheduling, storage and loading checks. `MAX_PROCESSING_JOBS` can raise the default of one active expensive operation; choose a value that fits the machine's model memory requirements.

DJ suggestions require `GEMINI_API_KEY`; `GEMINI_DJ_MODEL` can override the existing model setting. Recommendations use current room history and queue context. Errors are displayed without fabricated fallback suggestions.

See [the audit report](docs/CODE_AUDIT.md) for verified changes and remaining limits. Room/job coordination remains process-local, so use a single backend instance until durable shared coordination is added.
