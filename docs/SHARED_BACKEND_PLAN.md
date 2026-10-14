# Shared web and iOS backend proposal

Status: October 14, 2026. The owner approved initially sharing the existing API with the native SwiftUI/AVFoundation app. The owner subsequently approved Mac mini processing first, plus an iPhone benchmark. Further major architecture changes and deployment still require approval. No infrastructure has been changed.

## Starting point

The web application's HTTP routes already provide catalog/search, room mutations, SSE updates, processing admission, job status, lyric repair, and private ranged audio. Both clients can share these contracts. Processing and GCS credentials belong on the server; an iOS build should not contain the downloader secret or a service-account credential.

The existing `deploy.sh` targets Google Cloud Run in `karaoketrain-508500`, with an L4 GPU and the private `karaoke-stems-lyrics` bucket. This is configuration evidence, not verification of what is currently deployed. Local development uses the downloader at port 4000. Its public Cloudflare hostname still needs configuration work.

Another remote branch, `codex/ios-port`, contains an earlier native SwiftUI/AVFoundation app, on-device Core ML separation, and a different web/backend directory layout. Preserve that branch. Reuse reviewed native code where useful instead of merging its entire repository restructuring. Its older native endpoints and embedded development-secret design do not match this checkout's API.

## Recommended stages, pending approval

1. Keep the current project layout and processing pipeline. Bring the Swift screens/audio client forward using the existing HTTP API. First establish host/remote, cached playback, queue, lyric timing and failure handling. Processing location is an explicit owner decision because the earlier port used on-device inference.
2. Introduce a versioned API contract and user/room authorization before distributing the app. Short-lived user tokens verified by the backend are one option; Firebase documents [ID-token verification](https://firebase.google.com/docs/auth/admin/verify-id-tokens). Agree on anonymous room access versus accounts before choosing a provider.
3. Move room state, job status and processing reservations into durable storage with atomic per-song ownership. This is required for recovery and multiple instances. Cloud Run's session affinity is best effort; [Google recommends shared state for persistent connections](https://docs.cloud.google.com/run/docs/triggering/websockets). Even a [maximum-instance setting can be exceeded briefly](https://docs.cloud.google.com/run/docs/configuring/max-instances-limits), so it is not a distributed lock.
4. Separate a lightweight API from the resource-heavy worker after the durable job contract exists. Cloud Run is a natural candidate because GCS and deployment configuration are already in this project; that recommendation still needs a latency/cost benchmark. Use a durable dispatch mechanism and idempotent publication. [Cloud Tasks HTTP handlers have a 30-minute maximum deadline](https://docs.cloud.google.com/tasks/docs/dual-overview); tasks exceeding that should use an appropriate job execution model rather than acknowledge early and lose retries. [Cloud Run jobs](https://docs.cloud.google.com/run/docs/configuring/task-timeout) are an option to evaluate.
5. Keep GCS private. The current same-origin range proxy can serve both clients initially. Later consider short-lived, scoped [signed URLs](https://docs.cloud.google.com/storage/docs/access-control/signed-urls) for direct media delivery after authorizing the room/user. Anyone possessing a signed URL can use it until expiry; avoid logging it and support refresh during long playback.

Do not move browser-cookie-based downloading into a generic container without testing how it authenticates. The downloader can remain a separately authenticated service while API/worker hosting is evaluated. Mobile clients should ask the API for processing, never call the downloader directly with a shared administrative secret.

## Current room contract

- `GET /api/party?id=ABCD`: room snapshot. `GET /api/party/stream?id=ABCD`: SSE snapshots and job updates.
- `POST /api/party`: authoritative `id` and `action`; actions include add, next, previous, remove, reorder, playNow, updateSettings and remoteControl.
- Every queued instance has a `queueId`, even when its `videoId` repeats. New remove/playNow clients send `expectedQueueId`; reorder also sends `expectedTargetQueueId`. Next/previous send `expectedCurrentQueueId` (or null when empty). A stale selection returns HTTP 409 plus the latest `party` snapshot. Legacy positional clients remain accepted during migration.
- `GET /api/separate/status?jobId=...`: processing state and completed lyric payload. `GET /api/stems?jobId=...&stem=multiplex`: private byte-range audio. Multiplex channels are instrumental-left and vocals-right; mix both to both speakers in native playback.
- Queued-song SSE statuses omit full lyrics; current-song ready status includes them. Lyric revisions update the displayed text without restarting audio. Each repeated queue entry must start playback from zero.

## Approval and validation needed

Choose server versus on-device processing, the initial hosting region/budget, and the account/room access model before introducing new services. Measure cached playback startup separately from cold processing. Test real iPhone permissions, audio routes, interruptions, mic/recording, YouTube playback and background transitions before claiming complete 1:1 parity.

The owner's Mac mini is a reasonable first shared-server candidate because the current downloader, Demucs, Qwen and GCS adapters already run there. This is an operational recommendation, not a measured speed comparison with the iPhone 18 Pro. The earlier Swift port restricts Core ML to CPU-only; benchmark accelerator settings on physical hardware before ruling out phone processing. See [the measurement plan](../ios/BENCHMARK_PLAN.md). Dependable remote Mac hosting still needs stable authenticated ingress, process supervision and a recovery strategy. The current broken custom Cloudflare hostname should not be treated as a production endpoint.
