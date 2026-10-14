> Historical reference from `codex/ios-port`. Paths and processing protocols below describe that branch. Read [README.md](README.md) for this checkout.

# Physical-device song processing

## What this build does

1. Check the existing GCS cache. A cached song skips Demucs.
2. For an uncached song, the backend streams YouTube audio through FFmpeg into a temporary GCS PCM object, calculating whole-track normalization without a local audio file.
3. iOS fetches one 10-second segment at a time, runs the bundled Core ML model, combines drums/bass/other into instrumental, overlap-adds the results, and uploads the two mono signals. Only the model working set, current segment and overlap tail are retained.
4. The backend encodes and publishes `processedSongs/<videoId>/{multiplex.m4a,no_vocals.wav,vocals.wav,metadata.json}`. Multiplex is instrumental-left/vocals-right, matching the web player. A shared peak-based gain avoids clipping while preserving relative stem levels. Temporary session objects are removed on completion/cancellation/failure.
5. The **existing web Whisper engine runs on the server**, reading vocals over HTTP from GCS. It reuses LRCLIB lookup, romanization and word alignment, then saves lyrics into the same GCS metadata document the web app uses. Transcription is not an on-device Whisper implementation.
6. iOS streams the cached multiplex, mixes both channels to both speakers, displays selectable lyric versions, and uses audio time to synchronize muted YouTube video.

No application-level song/audio/transcript files are staged on disk in this native path. Model assets and OS/network caches are separate; Whisper's model is cached on the server. The older web-only separation path still stages local audio, unchanged here.

## Before running on your iPhone

- Use Xcode's `KaraokeTrain` scheme and select your physical iPhone. Set your development team under Signing & Capabilities if needed. The target now explicitly supports **iOS 17+** instead of inheriting the installed SDK version.
- For uncached separation, this conservative test build requires **at least 6 GB physical RAM and 2 GiB currently available to the app**. It stops when thermal state is serious/critical. Cached playback does not load Demucs or require this memory check.
- Keep the iPhone and Mac on the same reachable Wi-Fi network. Allow Local Network access. `KaraokeServerURL` and `KaraokeBackendURL` in `KaraokeTrain/Info.plist` are currently `http://10.0.0.60:3000` and `http://10.0.0.60:4000`; change both if the Mac's address changes.
- Keep both development services running from the repository root:

  ```sh
  npm start
  ```

- The launcher checks both services, safely reuses healthy ones, and reports occupied ports without killing unrelated processes. Stop an older server before relaunching to pick up code/environment changes. It uses Webpack for local Next development: Turbopack stalled compiling `/api/catalog` during the September 21 runtime audit. The workspace root is explicitly pinned so unrelated ancestor lockfiles cannot change module resolution.
- Both services use the existing `.env.local` (the web file is a symlink). Required: `DOWNLOADER_SECRET`, `STORAGE_MODE=gcs`, `GCS_BUCKET_NAME`, and working Google application-default credentials with object read/write/delete access. The backend also needs `yt-dlp`, FFmpeg, and its configured browser cookies. The combined local launcher points the web server's `DOWNLOADER_API_URL` to the backend it starts, avoiding a dependency on the production tunnel. When starting services separately or deploying, that URL must reach a downloader using the same bucket and secret.
- The Whisper runner now automatically finds `backend/venv/bin/python3`. `PYTHON_BIN_PATH` can override this in another deployment. That environment needs `faster-whisper`, PyAV and the Whisper `base` model.
- Create `ios/KaraokeTrain/LocalDevelopment.xcconfig` with `KARAOKE_API_SECRET = <your server's DOWNLOADER_SECRET>`. This file is ignored by Git; `Development.xcconfig` includes it in both build configurations. Rebuild after changing the value. The secret is embedded in the built app, so **this is not production authentication; don't distribute this build publicly.**
- Restore the separately transferred Core ML package using [MODEL_SETUP.md](MODEL_SETUP.md) before testing uncached separation on another Mac.

## First device test

1. Start in portrait, choose **Host a Party**, and verify the room rotates into landscape and stays landscape when you turn the phone.
2. Scroll **Ready to Sing** beyond the first screen. Select a cached song first to check networking, audio, lyrics and the vocal toggle without loading the model.
3. Search for a short **uncached** song you are authorized to process. A cached song cannot test separation. Keep the app foregrounded, watch Xcode's memory gauge, and start at modest speaker/headphone volume.
4. Expect these phases: GCS preparation → on-device separation/upload percentage → GCS encoding → transcription/alignment → playback. CPU-only inference is intentional for the first safety-focused test; it can be slow. The phone's auto-lock is disabled during processing.
5. Toggle vocals and listen for instrumental on **both** speakers. Scrub forward/backward and verify lyrics and video follow audio. Test alternate lyric versions when available. Positive lyric offset delays lyrics, matching the web.
6. Reopen the same song: it should reuse GCS audio and completed lyrics, with no new model inference. Also check the song from the web host.
7. During a second uncached test, try Cancel, leaving the room, switching songs, and backgrounding the app. Processing should stop with a retryable message; completed GCS audio must remain. A synchronous Core ML prediction cannot be interrupted mid-call: cancellation takes effect after the current segment. The shared actor prevents overlapping model jobs.
8. Disconnect Wi-Fi briefly during an upload. Idempotent reads/chunk uploads retry; unrecoverable failures show a message. Retry reuses *completed* cached audio; unfinished separation currently starts a new session rather than resuming old chunks.

If lyrics fail, the audio remains cached and playback is available. **Retry** reruns the cache/lyrics path without repeating completed separation. A server transcription already running can finish after the phone cancels, leaving reusable cached lyrics. Instrumental-only/silent audio can legitimately produce an empty lyric list.

## Runtime audit verified on the development Mac (2026-09-21)

- Both local services start and answer role-specific health checks; a second launcher reuses them. A duplicate backend port now exits nonzero instead of falsely announcing success. Environment loading works from another working directory.
- Physical-device and simulator Debug builds passed after the playback/connection fixes (signing disabled).
- All 13 backend/bridge regression tests passed: startup failures, ranges, stream failure survival, native separation protocol, and YouTube readiness/buffering/error handling.
- Live WebKit played YouTube's API demo using the exact HTML/JavaScript bundled in iOS, including its HTTPS bundle-identifier origin. This was macOS WebKit, not an iPhone.
- Live AVPlayer streamed an existing cached GCS song and advanced playback through the production audio mixer, muted, without saving media files.
- Read-only smoke checks passed for the web home, health endpoints, 96-song catalog, audio HEAD/suffix/open/clamped byte-range responses on both services, and 52 cached lyric lines. No cloud objects were changed by these checks.
- Native room entry now waits for server connection; failures show an alert. YouTube errors show a retry action. Audio buffering pauses video synchronization, and repeated queue entries restart playback properly.

Re-run the read-only service check while `npm start` is running:

```sh
node tests/live-services.mjs
```

## Processing checks previously verified on the development Mac (2026-09-20)

- Physical-device and simulator Xcode builds succeeded with signing disabled; signing/installing on your phone remains your Xcode step.
- Six backend tests passed, covering chunk boundaries, malformed/non-finite PCM, normalization across partial network frames, duplicate uploads, real FFmpeg encoding, publication order, partial-publication repair, cache reuse, cancellation and invalid sources.
- Standalone Swift overlap-add test passed seven boundary cases, preserving every stereo sample.
- Original Demucs → converted PyTorch wrapper: peak error `0.00001055`, relative RMS error `0.00001556` on deterministic synthetic stereo.
- Converted wrapper → shipped Core ML artifact (CPU): peak error `0.000828952`, relative RMS error `0.000936418`. The validation process peaked at 1785 MiB on macOS, **including both Python frameworks; this is not an iPhone memory measurement**.
- Real Whisper loaded a two-second HTTP silence stream and returned valid empty lyrics. This checks execution/dependencies/streaming, **not recognition accuracy**.
- Live GCS list/read and temporary-object upload, conditional copy/update and download passed. Both temporary test objects were deleted; existing `processedSongs` content was unchanged.
- Live native cached-lyrics endpoint returned a completed 52-line cached result; catalog returned 96 songs. Modified web files passed ESLint.

Re-run checks:

```sh
npm test --workspace=backend
# From web/:
node ../backend/test-native-lyrics.mjs
# From the repository root:
backend/htdemucs-coreml/venv/bin/python3 backend/htdemucs-coreml/validate_model.py --package ios/KaraokeTrain/KaraokeTrain/HTDemucs_CoreML.mlpackage
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcrun swiftc ios/KaraokeTrain/KaraokeTrain/DemucsOverlap.swift ios/Tests/OverlapSmoke.swift -o /private/tmp/karaoke-overlap-smoke
/private/tmp/karaoke-overlap-smoke
```

## Remaining limits and review notes

- **No zero-crash guarantee:** Xcode builds and synthetic tests do not establish device peak memory, thermal behavior, uninterrupted background inference, real-song separation quality or transcription accuracy. Run the short foreground device test before long songs. Memory/thermal checks reduce risk but cannot prevent every OS memory termination.
- Native processing is intended for the existing single-backend/single-web-server development setup. Job/room status is in memory, with limited concurrency and timeouts; GCS results persist across restarts. Before scaling, add a durable queue and distributed per-song publication lock shared by native and web processing. Generation checks reject conflicting object writes but are not a multi-object transaction.
- Configure a GCS lifecycle policy for the `nativeSeparation/` staging prefix before long-term use. Normal cancellation cleans it, but abrupt server termination can leave orphan staging objects. Do not apply such a deletion policy to `processedSongs/`.
- The converter used to report success even if numerical validation failed. It now fails closed; `validate_model.py` separately checks against original Demucs. The shipped model was validated, not regenerated. Synthetic parity is not a musical quality benchmark, and native overlap/shift settings are not bit-identical to the web Demucs CLI defaults.
- The web lyric lookup accepts the first non-empty LRCLIB search and alignment includes heuristic extrapolation. Wrong song versions/live edits can therefore get plausible but wrong lyrics/timings. Candidate confidence and a user-visible lyric-source chooser deserve review; these matching heuristics were not silently replaced.
- The existing web catalog trusts object naming and fetches metadata concurrently without a true concurrency cap. This pass excludes unfinished entries without multiplex audio, but large-library pagination/concurrency still needs work.
- The existing web APIs/shared dev secret are not a production access-control design. Per-user authentication, scoped upload sessions, HTTPS configuration and bounded durable background jobs remain deployment work.
- Native microphone effects, DJ/voice search, complete remote-settings synchronization and visual parity beyond these processing-related screens are not completed by this pass. YouTube embedding/network policy and rotation/scroll gestures still need actual-device observation.

To continue after an interruption, start with this checklist and the current uncommitted files. Do not regenerate the Core ML artifact or rebuild the port from scratch.
