const intents = new WeakMap();

export function playMedia(audio, onError = console.warn) {
  if (!audio) return;
  intents.set(audio, true);
  audio.play()?.catch(error => {
    if (error.name !== 'AbortError' && intents.get(audio)) onError(error);
  });
}

export function pauseMedia(audio) {
  if (!audio) return;
  intents.set(audio, false);
  // Pause immediately, including pending/buffering play requests.
  audio.pause();
}
