export function selectedLyrics(lyrics, versionIndex = 0) {
  return (lyrics?.[0]?.lyrics ? lyrics[versionIndex]?.lyrics || lyrics[0].lyrics : lyrics) || [];
}

// Word timing is authoritative. Old cache entries may retain a studio line time.
export function prepareLyricTimeline(lines) {
  const timeline = (lines || []).filter(line => line?.text?.trim()).map(line => {
    const words = (line.words || []).filter(word => word?.word && Number.isFinite(word.start) &&
      Number.isFinite(word.end) && word.start >= 0 && word.end > word.start)
      .toSorted((a, b) => a.start - b.start);
    const start = words[0]?.start ?? line.time;
    return { ...line, words, start, end: words.length ? Math.max(...words.map(word => word.end)) : null };
  }).filter(line => Number.isFinite(line.start) && line.start >= 0).toSorted((a, b) => a.start - b.start);
  return timeline.map((line, index) => {
    const end = line.end ?? timeline[index + 1]?.start ?? line.start + 5;
    const previous = timeline[index - 1];
    // Give a short preview, but let the previous sung word finish first.
    const previousEnd = previous?.end ?? (previous ? line.start : 0);
    const activation = Math.min(line.start, Math.max(line.start - .3, previousEnd));
    return { ...line, end: Math.max(line.start, end), activation };
  });
}

export function lyricPlaybackState(timeline, time) {
  if (!timeline.length) return { index: -1, singing: false, rest: false, countdown: 0 };
  let low = 0, high = timeline.length - 1, index = -1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (timeline[middle].activation <= time) { index = middle; low = middle + 1; }
    else high = middle - 1;
  }
  if (index < 0) return { index: 0, singing: false, rest: true, countdown: Math.ceil(timeline[0].start - time) };
  const line = timeline[index];
  const next = timeline[index + 1];
  if (next && time > line.end + .5 && next.start - line.end >= 2.5) {
    return { index: index + 1, singing: false, rest: true, countdown: Math.max(0, Math.ceil(next.start - time)) };
  }
  return { index, singing: time >= line.start && time < line.end, rest: false, countdown: 0,
    finished: !next && time >= line.end };
}

export function wordProgress(word, time) {
  if (!Number.isFinite(word.start) || !Number.isFinite(word.end) || word.end <= word.start) return 0;
  return Math.max(0, Math.min(1, (time - word.start) / (word.end - word.start)));
}

export function wordSeparator(word, nextWord) {
  if (!nextWord || /\s$/.test(word)) return '';
  // Chinese/Japanese character tokens should not acquire artificial spaces.
  return /[\u3040-\u30ff\u3400-\u9fff]$/.test(word) && /^[\u3040-\u30ff\u3400-\u9fff]/.test(nextWord) ? '' : ' ';
}
