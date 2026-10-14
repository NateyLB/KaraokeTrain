# Web → Swift parity audit (2026-10-12)

The web source is the reference. Keep the working native Demucs/GCS/audio code;
do not regenerate the port or model to change screen behavior. This is **not yet
complete 1:1 parity**.

## Implemented in this continuation

| Web reference | Swift implementation |
| --- | --- |
| `app/room/[id]/page.js` empty/processing branch | Search stays visible until the selected queue entry's audio player is ready. No video/lyrics processing screen. Waiting/search adapts to rotation; actual playback forces landscape. |
| `components/SongQueue.js` | Pending/processing/failed current song is shown in the queue, along with progress, errors, cancel/retry, remove/reorder and ready-only Play Now. Drawer fits the screen instead of a fixed 400pt height. |
| Web background preparation | `QueuePreparationModel` serially prepares native queued songs independently of playback. Duplicate video IDs reuse results; removed jobs cannot publish stale readiness. One Core ML job at a time protects memory. |
| `app/page.js` | Branding, tagline, OR separator, host/join cards, help, scroll-safe small-screen layout. Join input follows the server's four-character validation. |
| `components/SearchBar.js` | Same conversational routing to Session DJ, recommendation buttons forcing YouTube search, distinct no-results/catalog states, reset after queueing, purple cached-row border and speech-to-text input. |
| `hooks/usePartySync.js` | Native host consumes remote next/previous/align/play/video commands and play/vocals/video/lyrics settings. Host changes publish back with debounce and a no-echo guard. Uses polling, not SSE yet. |
| `components/PlayerControls.js` | Compact mobile button row, seek bar, lyric version menu, vocals/video, align, half-second nudges, reset and song-time labels. |
| `app/remote/[id]/page.js` | Inline search with collapsed catalog, playback/mixing controls and queue access; leaving dismisses the remote. |

## Verified this pass

- Simulator build succeeded during iteration; see the task's final report for final device-build results.
- Deterministic Swift queue tests: readiness gating, serial work, duplicate/reorder reuse, removal, stale completion, errors, background cancellation and retry.
- Swift web-contract tests: question routing, DJ response decoding, remote commands, numeric/string lyric offsets and rejection of non-finite settings.
- 15 Node regression tests passed, including DJ spawn failure, malformed output and timeout.
- Shared DJ endpoint now finds the backend Python environment and fails gracefully instead of emitting an unhandled spawn error. Its existing Python recommendation behavior was preserved.

## Gaps still to port/validate

- Native microphone monitoring, echo, pitch correction/noise cancellation, recording/export, pitch visualization/grading and leaderboard are not implemented. The old cosmetic microphone toggles were misleading; they are now explicitly disabled while the real vocals mixer remains available.
- Voice search needs real-device permission, language, audio-route and interruption testing. Server DJ availability still depends on Python/provider configuration; the web Python script contains a canned fallback when its SDK/key is missing.
- Native queue progress currently lives on the host. Remote clients receive server job readiness but not each native processing phase. Add an authenticated per-room native status contract before claiming queue parity across clients.
- Native inference is intentionally serial. A cached queued song behind a long uncached job should eventually get a separate lightweight cache-readiness lane, without allowing overlapping Core ML predictions.
- Polling vs SSE, full microphone/recording remote settings, exact typography/icons/spacing, and multi-device screenshot/interaction comparisons remain outstanding.
- Actual iPhone separation quality, thermals, memory and long-song behavior remain device tests, not established by simulator builds.

## Web issues noted, not silently copied

- The web join input accepts up to 12 characters, but `lib/validators.js` only accepts four.
- `SearchBar.js` reads DJ history/current-song/queue from top-level store keys, although live room state lives in `partyState`; Swift sends the actual room context.
- The web remote requests a second separation start after queueing, even for native-host rooms. Avoid porting this duplicate work; native hosts own their processing lane.
- The web microphone/recording features and LRCLIB candidate matching still need their own quality review. Visual polish is not evidence those paths are error-free.

## Repeatable checks

From the repository root (macOS with Xcode):

```sh
npm test
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcrun swiftc ios/KaraokeTrain/KaraokeTrain/Models.swift ios/KaraokeTrain/KaraokeTrain/QueuePreparationModel.swift ios/Tests/QueuePreparationSmoke.swift -o /private/tmp/karaoke-queue-smoke
/private/tmp/karaoke-queue-smoke
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcrun swiftc ios/KaraokeTrain/KaraokeTrain/Models.swift ios/KaraokeTrain/KaraokeTrain/PartyViewModel.swift ios/KaraokeTrain/KaraokeTrain/SongSearchModel.swift ios/Tests/WebParitySmoke.swift -o /private/tmp/karaoke-web-parity-smoke
/private/tmp/karaoke-web-parity-smoke
```

Device flow to verify: Host → search → queue an uncached song → remain on
search → open queue and observe progress → add/reorder/remove another song →
ready song enters landscape playback → remote pause/vocals/video/align/next →
queue failure returns to searchable state with retry. No GCS media is changed by
the deterministic tests above.
