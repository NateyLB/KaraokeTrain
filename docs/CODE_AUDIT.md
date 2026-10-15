# KaraokeTrain cleanup and code audit

Completed October 14, 2026. Existing transcription, alignment, cached playback, and private GCS audio fixes were preserved. This report covers the web refactor; no cloud deployment was made.

## Cleanup and organization

Removed 45 obsolete files: root patch/repair/manual-test scripts, scratch output, dummy audio, logs, starter assets/CSS, unused Basic Pitch weights, unused Spotify/guide-note services, old Whisper wrappers, and unused visualizer/grading/leaderboard/loading code. Removed seven unused direct npm dependencies; 68 packages were pruned. Dependencies occupy about 606 MB, previously about 1.1 GB. Removed a further 519 MB of unused Turbopack build/development caches and obsolete Python bytecode. Required Python environments and model caches remain runtime dependencies.

Libraries are grouped by domain: `lib/audio`, `lib/http`, `lib/lyrics`, `lib/party`, `lib/processing`, `lib/search`, and `lib/storage`. Client views use React components and hooks; resource-owning services use classes and dependency injection. Object composition is used without unnecessary inheritance.

## Findings addressed

| Finding | Change |
| --- | --- |
| Concurrent routes could launch duplicate work and bypass processing admission. | Both routes use `SongProcessingService` and `TaskScheduler`. Reservations and deduplication are synchronous; the default is one active operation and at most 20 waiting. Lyrics repairs share capacity. Cached playback bypasses the queue. |
| Child processes and transfer failures could retain resources. | A shared process runner bounds output and time, terminates timed-out processes, and propagates failures. Download streams use `pipeline`. |
| Microphone effects and playback nodes survived stop/song changes. | `MicrophoneEngine` owns tracks, every effect node, feedback loop and animation frame. `MultiplexGraph` disconnects old song routing while retaining the shared context. Late microphone permission results are discarded. |
| Camera requests, recording callbacks and object URLs could outlive the component. | Camera requests use cancellation generations. Unmount stops owned tracks and recorder callbacks; download URLs are released. Recording timers reset through component lifetime. |
| Polls overlapped or continued after navigation; full-song prefetch blobs were retained. | Song loading uses sequential, cancellable polling with a deadline and HTTP errors. Media streams through same-origin byte ranges. Each queue entry has its own session identity, including repeated videos. |
| Queue HTTP handling and host/remote presentation were duplicated. | Shared party client/actions, queue list/status/actions, artwork, notifications, search results, room views, and scoped styles replace repeated code. HTTP failures produce visible feedback. |
| Playback frames rerendered unrelated UI. | Whole-store subscriptions were replaced with scoped selectors. The lyric clock is subscribed inside `RoomLyrics`. |
| Settings and queue indices accepted invalid values; oversized JSON was unbounded. | Routes enforce bounded streamed JSON, object shapes, integer indices, typed settings, known commands and senders, validated IDs, and limited metadata fields. Queue capacity is also checked at the mutation boundary. |
| SSE state could replay old commands and leak timers. | Room-scoped subscriptions own timers and cancellation. Initial snapshots do not replay commands. Timestamp ordering is monotonic. Playing a queued track retains Back history. Queue SSE payloads omit unneeded lyrics; current-song lyrics remain immediately available. |
| Concurrent phone/host queue changes could remove or play the wrong entry; Back could exceed the queue limit. | Mutations validate the rendered queue-entry identities and return a 409 conflict plus a fresh snapshot when stale. Next/previous guard the current selection. The remote changes the authoritative queue directly. Back rejects a full queue without losing history. |
| Catalog hydration transferred full lyrics, issued unbounded reads, and hid storage failures. | `SongStorage` centralizes local/GCS access, atomic metadata writes, 20 concurrent metadata reads, a coalesced one-minute catalog cache, and summary-only output. Permission failures remain failures rather than triggering fresh processing. |
| Search/DJ failures appeared as empty results; the DJ contained a mock SDK and fabricated fallback. | Search errors are visible; stale requests and speech recognition are cancelled. The DJ uses a bounded, validated Gemini REST request with the actual room context and an explicit unavailable response. The unused Python wrapper/dependencies were removed. |
| Installed dependency versions had production advisories. | Next.js and its matching lint configuration were updated to 16.4.0; compatible dependency fixes were applied. A scoped UUID 11 override preserves `teeny-request`'s unchanged `v4()` calls. Production npm audit reports zero findings. |

## Build and runtime

Node 22.12 or newer is declared; Docker uses Node 22 and the same pinned processing requirements as local setup. Docker prunes development dependencies after building.

The supported webpack builder is selected for development and production. Turbopack attempted to trace runtime storage paths into local Python environments and failed on their external interpreter symlinks. Runtime data, environments, models and environment files are excluded from build traces. See the [Next.js file-tracing issue](https://github.com/vercel/next.js/issues/95125), [supported builder options](https://nextjs.org/docs/app/api-reference/cli/next), and [Next.js 16.4 release](https://github.com/vercel/next.js/releases/tag/v16.4.0).

## Verification

- Initial cleanup regression suite: 52 JavaScript and 22 Python checks passed (74 total). The follow-up adds seven queue-concurrency/client regressions; see the current verification below.
- Full ESLint: zero errors and warnings.
- Production webpack build passed; 16 trace manifests contained no virtual environments, models, uploads or environment files.
- Real GCS adapter: 99 catalog entries, about 19 KB of summary JSON, and saved audio/lyrics read successfully. Catalog reads share their cached result.
- Local API smoke checks: malformed input/indices/settings/commands/IDs returned 400; oversized JSON returned 413; saved audio returned a correct 1,024-byte 206 response; authenticated downloader validation returned 400 for an invalid ID.
- The relocated Qwen worker reused a saved transcript and returned 55 lyric lines with timing version 1.
- A synthetic three-second clip completed the actual streamed download, Demucs, multiplexing and Whisper pipeline in 20 seconds. Test files were removed; no synthetic data was written to GCS.
- Browser: saved catalog, cached audio/video/lyrics, host and remote playback, seeking/highlighting, queue addition/reordering/removal, and same-video replay from zero all passed in isolated room AUDT. The room remains available with playback paused. Preview: `/private/tmp/karaoketrain-cleanup-final.png`.

## Remaining limits

- The full npm audit reports five development-package findings from the unresolved `braces` advisory chain through the Next.js ESLint plugin. Production audit is clean. npm proposes an incompatible downgrade of the lint configuration, which was not applied. Track the [upstream advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).
- Rooms, jobs and rate limits are process-local. A durable/distributed coordinator is needed before supporting multiple backend instances or recovery across restarts. This audit did not introduce cloud infrastructure.
- Live YouTube search returned 10 results. Gemini rejected the configured DJ key with `API_KEY_INVALID` (HTTP 400); update `GEMINI_API_KEY` in `.env.local` to enable live recommendations. The structured recommendation adapter passes its mocked contract tests.
- Microphone/camera hardware permissions were not activated during automation. Their ownership/cancellation paths are covered by resource tests. Docker was updated but cannot be built here because Docker is unavailable.
- Synthetic processing and saved-transcript execution verify the refactored pipeline; a complete new live YouTube song was not retranscribed during this cleanup. The existing Cloudflare custom-hostname configuration remains separate from the working local downloader.
- Local HTTP development uses SSE connections. Several simultaneously open room tabs can exhaust the browser's per-origin connection pool; keep local testing to the rooms in use. Production HTTPS should use HTTP/2.

## Follow-up improvements

The phone remote now reports connecting/reconnecting instead of always claiming a connection. Room-code entry matches the four-character server contract; search and catalog controls support labels and keyboard interaction. [Shared backend exploration](SHARED_BACKEND_PLAN.md) records the current contract and proposed migration stages; architectural choices remain pending owner approval.

Follow-up verification: 59 JavaScript and 22 Python checks pass (81 total); lint, production build, `git diff --check`, and the production dependency audit pass. Live API checks in isolated room QAPI verified stale remove/play rejection, current-song guards under simultaneous Next requests, 409 snapshots and invalid input. Browser room entry, connection status and remote queue controls were checked. Existing user rooms were not modified by these API checks.

## October 15 continuation

Ordinary usage was available when the scheduled continuation started; no reset credits were used. The existing local Xcode signing/privacy edits and credentials were preserved.

- Fixed lost host/phone settings: the old two-second interaction guard discarded remote updates while marking their revisions consumed. A room-owned `SettingsSynchronizer` now sends only locally changed fields, serializes requests, protects pending edits, and then applies the newest server snapshot. Clients with the same role can receive each other's changes. Server updates do not echo back; failed patches remain available for the next interaction without an automatic retry loop. Disposal removes subscriptions, cancels debounce and aborts requests.
- Queue actions now cancel on room changes/unmount and ignore late responses. Host Next/Back reuse the same action/error handling as the remote. Removed the unused playback-state ref. Providing a cancellation signal no longer disables the party client's 15-second deadline.
- Remote mixing toggles expose their pressed state, sliders have accessible labels, and collapsed catalog contents are excluded from keyboard and screen-reader navigation.
- Reviewed processing admission, private audio streaming/cancellation, storage paths, API validation and tracked secret filenames. No additional unused dependency or scratch file was confirmed for deletion.

Verification: 74 JavaScript and 22 Python checks pass (96 total), including eight new synchronization/cancellation regressions. ESLint and the production webpack build pass. All 16 production trace manifests exclude environments, model/runtime data and credential files. The production dependency audit reports zero findings. Native source was not changed during this continuation.

Browser checks used isolated room AR15: two phone controllers retained near-simultaneous changes, cached Angel of Mine audio played, a phone pause immediately after a host volume edit stopped the audio, host Next cleared the current selection, and phone Back restored it. The 103-song catalog and accessible collapsed state were verified. The test song is paused with microphone/recording disabled; temporary browser tabs were closed. Preview: `/private/tmp/karaoketrain-audit-oct15-remote.png`.

A catalog refresh stalled in the existing development process even though a fresh read-only GCS process loaded all 103 songs. Refreshing only its cached storage client restored API and browser catalog reads without restarting the room server. The diagnostic source edit was fully reverted and the room was preserved. The underlying stall was not isolated; recurrence needs further storage-client tracing. This is a recovered runtime incident, not a permanent storage fix or a credential change.
