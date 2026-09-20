
import json
import sys
import difflib

def normalize_text(text):
    return text.lower()

lrclib_data = [
  {"time": 1.0, "text": "See tình"},
  {"time": 3.0, "text": "Hoàng Thùy Linh"}
]

# Simulate Whisper hallucinating English text instead of Vietnamese
whisper_segments = [
    {"start": 1.0, "end": 2.0, "text": "Sitting", "words": [{"word": "Sitting", "start": 1.0, "end": 2.0}]},
    {"start": 3.0, "end": 4.0, "text": "Huang Thu Lin", "words": [{"word": "Huang", "start": 3.0, "end": 3.3}, {"word": "Thu", "start": 3.3, "end": 3.6}, {"word": "Lin", "start": 3.6, "end": 4.0}]}
]

lrclib_lines = [l["text"] for l in lrclib_data]
lrclib_line_times = [l["time"] for l in lrclib_data]

whisper_words_flat = []
for s in whisper_segments:
    whisper_words_flat.extend(s["words"])
whisper_texts = [w["word"].lower() for w in whisper_words_flat]

lrclib_words_flat = []
word_to_line = []
for line_idx, line in enumerate(lrclib_lines):
    words = line.split()
    for w in words:
        lrclib_words_flat.append(w)
        word_to_line.append(line_idx)
lrclib_texts = [w.lower() for w in lrclib_words_flat]

sm = difflib.SequenceMatcher(None, lrclib_texts, whisper_texts)

if sm.ratio() < 0.15:
    if lrclib_line_times:
        whisper_texts = []
        whisper_words_flat = []
        whisper_segments = []
        sm = difflib.SequenceMatcher(None, lrclib_texts, whisper_texts)
    else:
        print(json.dumps({"source": "whisper_fallback", "lyrics": []}))
        sys.exit(0)

mapped_flat_words = []
for tag, i1, i2, j1, j2 in sm.get_opcodes():
    if tag == 'equal':
        pass
    else:
        if j2 > j1:
            pass
        else:
            if lrclib_line_times:
                for k, w_text in enumerate(lrclib_words_flat[i1:i2]):
                    line_idx = word_to_line[i1 + k]
                    target_time = lrclib_line_times[line_idx]
                    words_before = sum(1 for prev_k in range(k) if word_to_line[i1 + prev_k] == line_idx)
                    dur = min(1.0, 0.1 * len(w_text) + 0.2)
                    start_time = target_time + (words_before * 0.4)
                    if mapped_flat_words:
                        start_time = max(start_time, mapped_flat_words[-1]["end"] + 0.01)
                    if j2 < len(whisper_words_flat):
                        next_valid_start = whisper_words_flat[j2]["start"]
                        if start_time + dur > next_valid_start:
                            dur = max(0.1, next_valid_start - start_time - 0.01)
                    mapped_flat_words.append({
                        "word": w_text, "start": start_time, "end": start_time + dur, "line_idx": line_idx
                    })

aligned_lyrics = []
for line_idx, line in enumerate(lrclib_lines):
    line_words = [w for w in mapped_flat_words if w["line_idx"] == line_idx]
    time_start = lrclib_line_times[line_idx] if line_idx < len(lrclib_line_times) else (line_words[0]["start"] if line_words else 0)
    aligned_lyrics.append({"time": time_start, "text": line, "words": line_words})

print(json.dumps({"source": "lrclib_aligned", "lyrics": aligned_lyrics}, indent=2))
