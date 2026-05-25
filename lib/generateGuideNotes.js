/**
 * Generates a procedural guide melody from synced lyrics timing.
 *
 * Since we don't have reference MIDI for arbitrary YouTube videos,
 * this creates a musically-reasonable sequence of target notes seeded
 * by the song title (so it's always the same for the same song).
 *
 * Each lyric line gets one target note. Notes move in small steps
 * within a comfortable vocal range and stay on a pentatonic scale
 * to always sound "singable".
 */

const PENTATONIC = [0, 2, 4, 7, 9]; // C D E G A semitone offsets
const MIDI_MIN = 52; // E3 — low end of comfortable singing range
const MIDI_MAX = 72; // C5 — high end

function seededRandom(seed) {
  let s = Math.abs(seed) || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

/**
 * @param {Array<{time: number, text: string}>} lyrics - parsed LRC lines
 * @param {string} songTitle - used to seed the RNG for consistent generation
 * @returns {Array<{midi: number, startTime: number, endTime: number}>}
 */
export function generateGuideNotes(lyrics, songTitle = '') {
  if (!lyrics || lyrics.length === 0) return [];

  const seed = songTitle
    .toLowerCase()
    .split('')
    .reduce((acc, c) => acc * 31 + c.charCodeAt(0), 7);
  const rng = seededRandom(seed);

  let lastMidi = 60; // Start at C4

  return lyrics.map((line, i) => {
    const nextTime =
      i < lyrics.length - 1 ? lyrics[i + 1].time : line.time + 3.5;

    // Step up or down by 1–3 semitones, biased toward small movements
    const direction = rng() > 0.5 ? 1 : -1;
    const step = Math.round(rng() * 3) * direction;

    // Snap to nearest pentatonic degree
    const base = Math.round(lastMidi / 12) * 12; // root of octave
    const candidate = lastMidi + step;
    const nearestPentatonic =
      PENTATONIC.reduce((best, offset) => {
        const note = base + offset;
        const note2 = note + 12;
        const note3 = note - 12;
        const closest = [note, note2, note3].reduce((a, b) =>
          Math.abs(b - candidate) < Math.abs(a - candidate) ? b : a
        );
        return Math.abs(closest - candidate) < Math.abs(best - candidate)
          ? closest
          : best;
      }, candidate);

    // Clamp to comfortable vocal range with a gentle bounce-back
    let midi = Math.max(MIDI_MIN, Math.min(MIDI_MAX, nearestPentatonic));

    // If we've been at the extremes for a while, gently push back to centre
    if (midi <= MIDI_MIN + 2) midi = Math.min(MIDI_MAX, midi + 5);
    if (midi >= MIDI_MAX - 2) midi = Math.max(MIDI_MIN, midi - 5);

    lastMidi = midi;

    return {
      midi,
      startTime: line.time,
      endTime: nextTime - 0.05,
    };
  });
}
