import os
os.environ["KMP_DUPLICATE_LIB_OK"]="TRUE"

import sys
import json
import argparse
import difflib
from faster_whisper import WhisperModel

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--wav', required=True)
    parser.add_argument('--lyrics_file', required=False, default="")
    args = parser.parse_args()
    
    model = WhisperModel("base", device="cpu", compute_type="int8")
    
    # If lyrics_file argument is passed, it is a JSON file
    lrclib_data = []
    if args.lyrics_file:
        try:
            with open(args.lyrics_file, 'r', encoding='utf-8') as f:
                lrclib_data = json.load(f)
        except:
            pass

    # Get total audio duration to calculate progress
    import wave
    import contextlib
    total_duration = 1.0
    try:
        with contextlib.closing(wave.open(args.wav, 'r')) as f:
            frames = f.getnframes()
            rate = f.getframerate()
            total_duration = frames / float(rate)
    except Exception:
        pass

    segments_gen, _ = model.transcribe(
        args.wav, 
        word_timestamps=True, 
        condition_on_previous_text=False, 
        no_speech_threshold=0.9
    )
    
    whisper_segments = []
    for s in segments_gen:
        # Report progress to stderr (so Node.js can parse it)
        progress = int((s.end / total_duration) * 100)
        print(f"PROGRESS:{progress}", file=sys.stderr, flush=True)
            
        # Extract word-level data
        segment_words = [{"word": w.word.strip(), "start": w.start, "end": w.end} for w in s.words if w.word.strip()]
        whisper_segments.append({
            "start": s.start, 
            "end": s.end, 
            "text": s.text.strip(),
            "words": segment_words
        })
        
    if not whisper_segments:
        print(json.dumps({"source": "whisper_fallback", "lyrics": []}))
        return

    if not lrclib_data:
        # Return pure whisper transcription with precise words
        print(json.dumps({
            "source": "whisper_fallback", 
            "lyrics": [{"time": s["start"], "text": s["text"], "words": s["words"]} for s in whisper_segments]
        }))
        return
        
    import unicodedata
    import string
    def normalize_text(text):
        text = unicodedata.normalize('NFC', text.lower()).strip()
        return text.translate(str.maketrans('', '', string.punctuation))

    lrclib_lines = []
    lrclib_line_times = []
    
    if lrclib_data:
        for l in lrclib_data:
            if l.get("text", "").strip():
                lrclib_lines.append(l["text"].strip())
                lrclib_line_times.append(l.get("time", 0.0))
        
    # Flatten all whisper words
    whisper_words_flat = []
    for s in whisper_segments:
        whisper_words_flat.extend(s.get("words", []))
        
    whisper_texts = [normalize_text(w["word"].strip()) for w in whisper_words_flat]
    
    # Flatten all lrclib words, but keep track of which line they belong to
    lrclib_words_flat = []
    word_to_line = []
    for line_idx, line in enumerate(lrclib_lines):
        words = line.split()
        for w in words:
            lrclib_words_flat.append(w)
            word_to_line.append(line_idx)
            
    lrclib_texts = [normalize_text(w) for w in lrclib_words_flat]
    
    sm = difflib.SequenceMatcher(None, lrclib_texts, whisper_texts)
    
    if sm.ratio() < 0.15:
        # Global Mismatch! Fallback to pure Whisper transcription
        print(json.dumps({
            "source": "whisper_fallback", 
            "lyrics": [{"time": s["start"], "text": s["text"], "words": s["words"]} for s in whisper_segments]
        }))
        return
    
    # Map each lrclib word to a start/end time
    mapped_flat_words = []
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == 'equal':
            for k in range(i2 - i1):
                w_text = lrclib_words_flat[i1 + k]
                w_data = whisper_words_flat[j1 + k]
                mapped_flat_words.append({"word": w_text, "start": w_data["start"], "end": w_data["end"], "line_idx": word_to_line[i1 + k]})
        else:
            # Mismatch. 
            if j2 > j1:
                # REPLACE: Whisper transcribed something here, so we have real Whisper timestamps
                block_start = whisper_words_flat[j1]["start"]
                block_end = whisper_words_flat[j2 - 1]["end"]
                block_duration = block_end - block_start
                block_lrclib = lrclib_words_flat[i1:i2]
                total_chars = sum(len(w) for w in block_lrclib)
                
                w_durs = []
                for w_text in block_lrclib:
                    dur = (len(w_text) / total_chars) * block_duration if total_chars > 0 else 0.3
                    # Cap duration so it isn't agonizingly slow. Fast words can be fast.
                    dur = min(dur, 0.1 * len(w_text) + 0.2)
                    w_durs.append(dur)
                    
                total_w_dur = sum(w_durs)
                curr_time = block_end - total_w_dur
                curr_time = max(block_start, curr_time)
                
                for k, w_text in enumerate(block_lrclib):
                    mapped_flat_words.append({
                        "word": w_text, 
                        "start": curr_time, 
                        "end": curr_time + w_durs[k], 
                        "line_idx": word_to_line[i1 + k]
                    })
                    curr_time += w_durs[k]
            else:
                # DELETE: Whisper completely missed these words.
                if lrclib_line_times:
                    # Anchor perfectly to official LRCLIB timestamps
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
                            "word": w_text,
                            "start": start_time,
                            "end": start_time + dur,
                            "line_idx": line_idx
                        })
                else:
                    # Fallback to extrapolation if no LRCLIB timestamps
                    if not mapped_flat_words:
                        block_start = 0.0
                    else:
                        block_start = mapped_flat_words[-1]["end"]
                        
                    extrapolated_end = block_start + 0.3 * (i2 - i1)
                    if j2 < len(whisper_words_flat):
                        next_valid_start = whisper_words_flat[j2]["start"]
                        block_end = min(extrapolated_end, next_valid_start - 0.01)
                    else:
                        block_end = extrapolated_end
                        
                    block_end = max(block_start + 0.01, block_end)
                    block_duration = block_end - block_start
                    block_lrclib = lrclib_words_flat[i1:i2]
                    
                    total_chars = sum(len(w) for w in block_lrclib)
                    w_durs = []
                    for w_text in block_lrclib:
                        dur = (len(w_text) / total_chars) * block_duration if total_chars > 0 else 0.3
                        dur = min(dur, 0.1 * len(w_text) + 0.2)
                        w_durs.append(dur)
                        
                    total_w_dur = sum(w_durs)
                    curr_time = block_end - total_w_dur
                    curr_time = max(block_start, curr_time)
                    
                    for k, w_text in enumerate(block_lrclib):
                        mapped_flat_words.append({
                            "word": w_text, 
                            "start": curr_time, 
                            "end": curr_time + w_durs[k], 
                            "line_idx": word_to_line[i1 + k]
                        })
                        curr_time += w_durs[k]
                
    # Enforce strictly monotonic timestamps to prevent UI glitching/overlapping words
    if mapped_flat_words:
        if mapped_flat_words[0]["end"] < mapped_flat_words[0]["start"]:
            mapped_flat_words[0]["end"] = mapped_flat_words[0]["start"] + 0.1
            
        for i in range(1, len(mapped_flat_words)):
            prev_w = mapped_flat_words[i - 1]
            curr_w = mapped_flat_words[i]
            
            if curr_w["end"] < curr_w["start"]:
                curr_w["end"] = curr_w["start"] + 0.1
                
            if prev_w["end"] > curr_w["start"]:
                midpoint = (prev_w["end"] + curr_w["start"]) / 2.0
                midpoint = max(prev_w["start"] + 0.01, midpoint)
                prev_w["end"] = midpoint
                curr_w["start"] = midpoint
                
                if curr_w["end"] < curr_w["start"]:
                    curr_w["end"] = curr_w["start"] + 0.1
                    
    # Now group the mapped flat words back into lines
    aligned_lyrics = []
    for line_idx, line in enumerate(lrclib_lines):
        line_words = []
        for w in mapped_flat_words:
            if w.get("line_idx") == line_idx:
                w_copy = {k: v for k, v in w.items() if k != "line_idx"}
                line_words.append(w_copy)
            
        # Use the highly accurate LRCLIB line timestamp for scroll timing,
        # rather than relying on Whisper's potentially misaligned first word.
        time_start = lrclib_line_times[line_idx] if line_idx < len(lrclib_line_times) else (line_words[0]["start"] if line_words else 0)
        aligned_lyrics.append({"time": time_start, "text": line, "words": line_words})
            
    print(json.dumps({
        "source": "lrclib_aligned",
        "lyrics": aligned_lyrics
    }))

if __name__ == "__main__":
    main()
