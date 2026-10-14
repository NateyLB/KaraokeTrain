/** Playback and microphone share a context and recording sink. */
export function getAudioRuntime() {
  if (!window.__karaokeAudioCtx) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    window.__karaokeAudioCtx = new AudioContext({ latencyHint: 'interactive' });
  }
  const context = window.__karaokeAudioCtx;
  if (!window.__karaokeMediaStreamDest) window.__karaokeMediaStreamDest = context.createMediaStreamDestination();
  return { context, recordingDestination: window.__karaokeMediaStreamDest };
}
