# Native Swift continuation

The web refactor is pushed on `codex/web-refactor` (`1863c7b`). Native work continues on `codex/ios-continuation`, based on that refactor. The original `origin/codex/ios-port` (`b9aea10`) remains intact; only its native source was restored, without its old repository restructuring or backend.

## Processing and playback

The owner approved **Mac mini processing first**, reusing the current web API, with an iPhone benchmark before reconsidering on-device processing. Native rooms use the shared queue, job status, private GCS stream, and Qwen/LRCLIB lyric engine. Adding a queue entry starts processing on the server; the native player waits without starting a duplicate job. Cached audio streams through AVPlayer and the native multiplex mixer. New queue entries become ready and paused, matching the web host. Retries and lyric repair are explicit operations.

The SwiftUI app includes home, host/remote, catalog/search/DJ/voice search, queue controls, video, lyrics, microphone, recording and help components. Room SSE supports reconnection, cancellation and bounded framing. Queue actions carry entry identities; automatic advance guards the song that actually ended. This is still a port under validation; no complete visual/device parity claim is made.

YouTube's play/pause controls also control the separated audio and lyric clock. Native playback commands carry revisions so delayed video events cannot override a newer pause; buffering and transient seek events do not become user playback requests. The video stays muted and follows the audio clock.

Saved-song lyric revisions are opaque tokens. Native room decoding accepts current string tokens such as `3:1791960133232` and legacy JSON numbers, including their appearance in queue/history entries. This fixes the cached-song “incorrect format” rejection caused by decoding current revisions as `Double`; existing audio and metadata can be reused.

Lyrics use authoritative word timing, continuous fill across glyph widths and wrapped words, stable layout, source labels, countdowns, seek snapping and Reduce Motion. Repaired lyrics retain the selected language. Revisions from another client refresh the lyrics without restarting audio.

## Microphone and recording

One owned AVAudioEngine serves microphone monitoring, pitch analysis, voice search and recording. Consumers hold independent leases; stopping search does not stop singing. Gain, delayed echo, nearest-chromatic-note pitch correction and optional system voice processing are implemented. Native AutoTune is chromatic correction, not a claim of matching the singer's intended melody. Permission requests have cancellation guards. Interruptions and disconnected audio routes stop capture safely and pause playback.

The approved recording design keeps streamed playback. Tap the record icon, choose Audio or Camera, then Stop & Save. A timestamped processed-microphone file and transport timeline capture pauses, buffering, seeks, song changes and vocal gains. Saving downloads cached stems, converts/mixes with bounded PCM buffers, and exports M4A or MP4. Camera timestamps are converted from the capture synchronization clock to the microphone's host clock; camera capture does not configure the shared audio session. Share or save to Files, then tap Done / Discard to remove temporary files.

Sessions are limited to 15 minutes, 512 MiB per downloaded source and 2 GiB temporary storage, with free-space checks. Backgrounding ends capture and requests time to finish saving; an expired background allowance preserves finalized capture for an explicit retry while this app session remains alive. Failed camera finalization offers Save Audio Instead. Cancellation waits for writers/workers before deleting their directory. Abandoned session folders expire after a day when another recording starts. Recovery after app termination and real-device lip sync remain unverified. See [RECORDING_DESIGN.md](RECORDING_DESIGN.md).

## Configuration and model

The simulator defaults to `http://localhost:3000`. For a phone, create ignored `KaraokeTrain/LocalDevelopment.xcconfig` and set `KARAOKE_SERVER_HOST` to the Mac's reachable LAN address. The Mac web app must run with `npm run dev`; the native app does not contact the downloader or hold its secret. Public hosting/authentication are separate pending infrastructure decisions; nothing has been deployed.

The owner's 222 MiB `HTDemucs_CoreML.mlpackage` was moved from Downloads into `KaraokeTrain/KaraokeTrain/HTDemucs_CoreML.mlpackage` and successfully compiled by Xcode. It stays ignored in Git and is excluded from Release builds. Normal playback/processing does not use it. In Debug, Help → Device stem benchmark offers CPU, CPU + GPU and All available modes, with 10-second quick and 30-second warm-timing workloads. Reports separate load/prediction/Swift processing, identify the hardware, and export as UTF-8 `.txt` or plain clipboard text. Run each on the requested physical iPhone 18; simulator timings describe the Mac. The first user-reported CPU + GPU benchmark processed ten seconds of generated audio in 15.473 seconds; its hardware identifier was not recorded. See the benchmark plan for the padding/startup caveats. See [BENCHMARK_PLAN.md](BENCHMARK_PLAN.md).

## Verification

Use Xcode 27 / Swift 6.4, deployment target iOS 17. Debug and Release simulator builds pass. Native checks cover 32 shared web timeline states, lyric decoding/selection and glyph geometry, SSE framing, room schemas/concurrency guards, server processing/cancellation, overlap assembly, microphone permission races/lease isolation, offline gain/mute/echo, timestamped microphone gaps, pause/seek/song/vocal mix reconstruction, sample-rate conversion, and complete synthetic M4A/MP4 exports. Camera export checks inspect the first visible frame to verify its offset, including the exporter's leading black frames.

```sh
./ios/run-tests.sh
# Live status/room checks require an existing ready in-memory job.
./ios/run-tests.sh --live-api http://localhost:3000 VIDEO_ID
# Cached GCS playback/export still work after the in-memory jobs reset.
./ios/run-tests.sh --live-media http://localhost:3000 VIDEO_ID
xcodebuild -project ios/KaraokeTrain/KaraokeTrain.xcodeproj -scheme KaraokeTrain \
  -configuration Debug -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath /private/tmp/karaoketrain-ios-build CODE_SIGNING_ALLOWED=NO build
```

The host test needs Node.js and macOS audio/video encoding services; restricted shells may require normal local execution. It includes regression checks for YouTube user controls, native command acknowledgments, buffering, seeking and stale playback revisions. Live checks use isolated rooms, cached status/lyrics/ranged audio, muted streaming and a one-second export with a synthetic silent microphone. They do not process new songs, capture hardware or write GCS objects. The live retry POST was removed after automatic approval review rejected its processing side effect; mocked tests cover retry/repair. Repository verification includes 74 JavaScript + 22 Python checks and clean lint.

The requested test device is **iPhone 18**. Xcode currently lists an iPhone 18 Pro simulator and a paired physical iPhone Air; the Air is not the selected test device. Hardware validation needs the iPhone 18 paired, developer signing configured, and the LAN server reachable. Check microphone/camera permissions, headphones/Bluetooth, interruptions, capture lip sync, share destinations, long recordings, lyric scrolling, orientation and Dynamic Type. Simulator UI control is unavailable through the enabled app tools, so build/launch checks do not establish visual parity.

The original `DEVICE_TESTING.md`, `MODEL_SETUP.md` and `PORT_PARITY.md` are historical references. Shared hosting options and approval boundaries remain in [SHARED_BACKEND_PLAN.md](../docs/SHARED_BACKEND_PLAN.md).

Latest verification: Debug and Release builds pass; the app launches and remains running on the iPhone 18 Pro simulator. All offline native checks, real cached AAC stream/mixer playback, real cached M4A recording export and isolated room/SSE checks passed. The transient job-status live check cannot run against the old cached ID after the server job registry reset (404); `--live-media` verifies persistent media without reprocessing. Physical recording, lip sync, UI parity and a hardware-identified warm iPhone 18 benchmark remain pending.
