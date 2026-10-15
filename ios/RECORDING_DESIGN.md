# Native recording design

Status: approved by the owner on October 14, 2026: **Keep player; mix on save**. The existing AVPlayer stream and Mac mini processing API remain in use.

Approved approach: keep fast streamed playback. Capture the processed microphone and optional camera on the phone. Record a small timeline of playback, pause, seek, song and vocal-mix changes. On Stop & Save, fetch the required cached media for the export, compose the backing track against that timeline, mix it with the recorded microphone/effects, and export an M4A or camera video using AVFoundation. Share the result through the system share sheet.

This preserves the working cached player and needs no new hosted service. The tradeoff is a final export step and temporary local recording/media files. Use a dedicated recording session folder, bounded disk/time limits, cancellation, and cleanup after the export/share session. Starting a recording must be an explicit action; microphone and camera permission denial must remain recoverable.

Microphone monitoring uses one shared AVAudioEngine capture resource for singing and voice search, with gain, echo, pitch processing and optional voice processing. Camera capture has its own service and must not silently take ownership of the audio session. Native audio interruption/route changes need coordinated handling.

The alternative is to replace or bridge the current AVPlayer path into a single live recording mixer. That could avoid reconstructing backing audio during export, but changes the playback pipeline, buffering and timing behavior. This broader player change needs explicit approval and separate latency tests.

Before calling the recommended approach complete, verify synthetic exports with known pauses, seeks, vocal levels and song changes, then test microphone/camera lip sync and route changes on a real iPhone. The timed music export must follow captured transport state, not assume uninterrupted playback from zero.

References: Apple's [audio mixing](https://developer.apple.com/documentation/avfoundation/avmutableaudiomix), [composition/export guide](https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/AVFoundationPG/Articles/03_Editing.html), and [AVAudioTime](https://developer.apple.com/documentation/avfaudio/avaudiotime).

Implementation: RecordingModel owns capture/export lifecycle; RecordingTimeline owns transport intervals; MicrophoneRecordingWriter performs bounded file writes off the render callback; RecordingAudioRenderer converts and mixes PCM; RecordingExporter composes/encodes; CameraRecordingService owns video-only capture. Synthetic timing, sample-rate conversion, M4A and MP4 exports pass. Physical iPhone 18 recording and lip sync remain pending. See README.md for limits, cleanup and background retry behavior.
