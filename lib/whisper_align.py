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
    parser.add_argument('--lyrics', required=False, default="")
    args = parser.parse_args()
    
    model = WhisperModel("base", device="cpu", compute_type="int8")
    
    # If lyrics argument is passed, it is a file path
    lyrics_text = ""
    if args.lyrics:
        with open(args.lyrics, 'r', encoding='utf-8') as f:
            lyrics_text = f.read()

    segments_gen, _ = model.transcribe(
        args.wav, 
        word_timestamps=True, 
        condition_on_previous_text=False, 
        no_speech_threshold=0.9
    )
    whisper_segments = []
    for s in segments_gen:
        # Rely on VAD to filter out silence, do not aggressively filter out high no_speech_prob
        # because highly musical singing often gets assigned a no_speech_prob of 0.6 to 0.8!
            
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

    if not lyrics_text:
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

    lrclib_lines = [l.strip() for l in lyrics_text.split('\n') if l.strip()]
    
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
            # Mismatch. Proportionally map this specific block
            if j2 > j1:
                block_start = whisper_words_flat[j1]["start"]
                block_end = whisper_words_flat[j2 - 1]["end"]
            else:
                # If these are deleted words BEFORE the first sung word (i.e. skipped intro),
                # assign them to exactly 0.0s so they scroll past instantly!
                if not mapped_flat_words:
                    block_start = 0.0
                    block_end = 0.1
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
                # Cap duration so unmatched words don't get stretched agonizingly slowly across giant audio gaps (like intros)
                # Max 0.2s per character, minimum 0.5s per word.
                dur = min(dur, max(0.5, 0.2 * len(w_text)))
                w_durs.append(dur)
                
            total_w_dur = sum(w_durs)
            
            # Pack the capped words at the END of the mismatch block so they zip by right before the next matched word
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
            
        time_start = line_words[0]["start"] if line_words else 0
        aligned_lyrics.append({"time": time_start, "text": line, "words": line_words})
            
    print(json.dumps({
        "source": "lrclib_aligned",
        "lyrics": aligned_lyrics
    }))

if __name__ == "__main__":
    main()
