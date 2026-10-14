# Native Swift continuation

The web refactor is committed and pushed on `codex/web-refactor` (`1863c7b`). This native work continues on `codex/ios-continuation`, based on that refactor. The original `origin/codex/ios-port` (`b9aea10`) remains intact; only its `ios/` source was restored, without its repository restructuring or older backend.

## Current state

- Reused SwiftUI home, host/remote, search, queue and player screens, AVFoundation streaming/multiplex mixer and YouTube bridge.
- Updated room decoding for the current web contract, unique queue IDs, cached status/revisions, catalog art and microphone settings. Stale queue actions now send entry identities and consume the API's 409 snapshot.
- Native room synchronization now uses the same SSE endpoint as the web, with bounded framing, reconnection, cancellation and generation guards. Remote Next/Back mutate the authoritative queue directly.
- Ported the current word-authoritative lyric timeline, sustained-word preview rules, instrumental countdowns, seek behavior and native-character spacing. Web and Swift consume the same fixture cases. Scrolling occurs on line changes/seeks, uses stable text layout, honors Reduce Motion, and avoids rebuilding unchanged rows. Audio time updates at 30 Hz. Word fill currently advances by character; continuous within-character gradient parity remains work.
- Centralized server configuration. The simulator defaults to `http://localhost:3000`. For a phone, create ignored `KaraokeTrain/LocalDevelopment.xcconfig` and set `KARAOKE_SERVER_HOST` to the Mac's reachable LAN address. The web app must be running with `npm run dev`.

This is a continuation checkpoint, **not completed 1:1 parity**. The owner approved sharing the existing API first. The follow-up choice between Mac mini and on-device processing is pending. The restored native-host path still expects the earlier branch's native processing endpoints and Core ML asset; those endpoints are not part of this web checkout. Native remote synchronization can use the current API. Do not distribute the earlier adapter's shared development secret or claim uncached native hosting works yet.

Native microphone monitoring/effects, recording/export, complete mixing/remote UI parity, authentication, real-device permissions/audio interruptions and full visual comparisons remain outstanding. The earlier port's model is not included in Git. Its `.cpuOnly` configuration is not evidence of accelerated iPhone performance.

## Checks

On this Mac, Xcode 27 / Swift 6.4 built and launched the simulator app with signing disabled. Deterministic Swift checks passed for queue preparation, overlap assembly, current/legacy API decoding, SSE framing, and 32 shared lyric playback states. Live checks passed for native room join/SSE/cancellation against an isolated room, and muted AVPlayer streaming plus the actual native vocal mixer against a cached GCS song. Simulator UI control was unavailable in the enabled app tools; no native visual-parity claim is made. Hardware performance and iPhone UI behavior require device testing.

```sh
./ios/run-tests.sh
# Optional live checks, while the web app is running. Supply an existing cached video ID.
./ios/run-tests.sh --live-api http://localhost:3000 VIDEO_ID
xcodebuild -project ios/KaraokeTrain/KaraokeTrain.xcodeproj -scheme KaraokeTrain \
  -configuration Debug -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath /private/tmp/karaoketrain-ios-build CODE_SIGNING_ALLOWED=NO build
```

The live room check changes only isolated room `NSSE`; the playback check streams a cached song muted. Neither test processes new media or writes GCS objects. The original branch's `DEVICE_TESTING.md`, `MODEL_SETUP.md` and `PORT_PARITY.md` are historical references and contain paths/protocols from that branch. This README describes the current checkout.

Native streaming uses Apple's [URLSession.AsyncBytes](https://developer.apple.com/documentation/foundation/urlsession/asyncbytes); scrolling uses [ScrollViewReader](https://developer.apple.com/documentation/swiftui/scrollviewreader). Backend hosting options and approval boundaries are in [SHARED_BACKEND_PLAN.md](../docs/SHARED_BACKEND_PLAN.md).
