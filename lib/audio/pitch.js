const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/**
 * Autocorrelation-based pitch detection.
 * Returns the dominant frequency (Hz) and RMS volume.
 */
export function detectPitch(float32Buffer, sampleRate) {
  const SIZE = float32Buffer.length;
  if (SIZE < 2 || sampleRate <= 0) return { frequency: -1, rms: 0 };
  const MAX_SAMPLES = Math.floor(SIZE / 2);

  // RMS for volume measurement
  let rms = 0;
  for (let i = 0; i < SIZE; i++) {
    rms += float32Buffer[i] * float32Buffer[i];
  }
  rms = Math.sqrt(rms / SIZE);

  // Silence threshold — not enough signal to detect pitch
  if (rms < 0.025) return { frequency: -1, rms };

  // Autocorrelation
  let bestOffset = -1;
  let bestCorrelation = 0;
  let lastCorrelation = 1;
  let foundGoodCorrelation = false;

  for (let offset = 1; offset < MAX_SAMPLES; offset++) {
    let correlation = 0;
    for (let i = 0; i < MAX_SAMPLES; i++) {
      correlation += Math.abs(float32Buffer[i] - float32Buffer[i + offset]);
    }
    correlation = 1 - correlation / MAX_SAMPLES;

    if (correlation > 0.9 && correlation > lastCorrelation) {
      foundGoodCorrelation = true;
      if (correlation > bestCorrelation) {
        bestCorrelation = correlation;
        bestOffset = offset;
      }
    } else if (foundGoodCorrelation) {
      // Parabolic interpolation for sub-sample accuracy
      const x1 = bestOffset - 1;
      const x2 = bestOffset;
      const x3 = bestOffset + 1;
      const shift =
        x1 < 0 || x3 >= MAX_SAMPLES
          ? 0
          : (float32Buffer[x3] - float32Buffer[x1]) /
            (2 * (2 * float32Buffer[x2] - float32Buffer[x1] - float32Buffer[x3]));
      return { frequency: sampleRate / (bestOffset + shift), rms };
    }
    lastCorrelation = correlation;
  }

  if (bestCorrelation > 0.01 && bestOffset > 0) {
    return { frequency: sampleRate / bestOffset, rms };
  }

  return { frequency: -1, rms };
}

/**
 * Converts a frequency (Hz) to a musical note with octave and cents offset.
 */
export function frequencyToNote(freq) {
  if (!Number.isFinite(freq) || freq <= 0) return null;
  const noteNum = 12 * Math.log2(freq / 440) + 69; // MIDI note number
  const rounded = Math.round(noteNum);
  const cents = Math.round((noteNum - rounded) * 100); // -50 to +50
  const noteName = NOTE_NAMES[((rounded % 12) + 12) % 12];
  const octave = Math.floor(rounded / 12) - 1;
  return {
    name: `${noteName}${octave}`,
    noteName,
    octave,
    midi: rounded,
    cents, // negative = flat, positive = sharp
    frequency: freq,
  };
}
