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

    # Pass first part of LRCLIB lyrics as initial prompt to guide whisper
    # Prevent whisper hallucination loops by disabling condition_on_previous_text
    if lyrics_text:
        # Heavily bias the neural network by feeding it the first 250 chars of the official lyrics.
        # This completely cures Whisper's tendency to hallucinate during silent/instrumental intros
        # and guarantees it will correctly identify the first phrase (especially for international songs).
        initial_prompt = lyrics_text[:250].replace('\n', ' ')
        segments_gen, _ = model.transcribe(
            args.wav, 
            word_timestamps=True, 
            condition_on_previous_text=False, 
            no_speech_threshold=0.4,
            initial_prompt=initial_prompt
        )
    else:
        segments_gen, _ = model.transcribe(
            args.wav, 
            word_timestamps=True, 
            condition_on_previous_text=False, 
            no_speech_threshold=0.4
        )
    
    whisper_segments = []
    for s in segments_gen:
        # Filter out heavy noise / silence hallucinations (e.g. "Subtitles by Amara.org")
        if s.no_speech_prob > 0.4:
            continue
            
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
        
    # Verification: compare exactly the first 50 words to avoid length mismatch penalties
    import unicodedata
    def normalize_text(text):
        return unicodedata.normalize('NFC', text.lower())
        
    whisper_words = [w for s in whisper_segments for w in s["text"].split()]
    lrclib_words = [w for l in lyrics_text.split('\n') if l.strip() for w in l.split()]
    
    compare_len = min(len(whisper_words), 50)
    
    whisper_early = normalize_text(" ".join(whisper_words[:compare_len]))
    lrclib_early = normalize_text(" ".join(lrclib_words[:compare_len]))
    
    similarity = difflib.SequenceMatcher(None, whisper_early, lrclib_early).ratio()
    
    if similarity < 0.25:
        # Mismatch! Fallback to pure Whisper transcription with precise words
        print(json.dumps({
            "source": "whisper_fallback", 
            "lyrics": [{"time": s["start"], "text": s["text"], "words": s["words"]} for s in whisper_segments]
        }))
        return
        
    # Match! Force Align LRCLIB lines to Whisper timestamps
    lrclib_lines = [l.strip() for l in lyrics_text.split('\n') if l.strip()]
    
    # Flatten all whisper words
    whisper_words_flat = []
    for s in whisper_segments:
        whisper_words_flat.extend(s.get("words", []))
        
    whisper_texts = [w["word"].strip().lower() for w in whisper_words_flat]
    
    # Flatten all lrclib words, but keep track of which line they belong to
    lrclib_words_flat = []
    word_to_line = []
    for line_idx, line in enumerate(lrclib_lines):
        words = line.split()
        for w in words:
            lrclib_words_flat.append(w)
            word_to_line.append(line_idx)
            
    lrclib_texts = [w.lower() for w in lrclib_words_flat]
    
    sm = difflib.SequenceMatcher(None, lrclib_texts, whisper_texts)
    
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
                block_start = mapped_flat_words[-1]["end"] if mapped_flat_words else 0
                block_end = block_start + 0.3 * (i2 - i1)
                
            block_duration = block_end - block_start
            block_lrclib = lrclib_words_flat[i1:i2]
            total_chars = sum(len(w) for w in block_lrclib)
            
            curr_time = block_start
            for k, w_text in enumerate(block_lrclib):
                w_dur = (len(w_text) / total_chars) * block_duration if total_chars > 0 else 0.3
                mapped_flat_words.append({"word": w_text, "start": curr_time, "end": curr_time + w_dur, "line_idx": word_to_line[i1 + k]})
                curr_time += w_dur
                
    # Now group the mapped flat words back into lines
    aligned_lyrics = []
    for line_idx, line in enumerate(lrclib_lines):
        line_words = [w for w in mapped_flat_words if w["line_idx"] == line_idx]
        # Remove line_idx from the output
        for w in line_words:
            del w["line_idx"]
            
        time_start = line_words[0]["start"] if line_words else 0
        aligned_lyrics.append({"time": time_start, "text": line, "words": line_words})
            
    print(json.dumps({
        "source": "lrclib_aligned",
        "lyrics": aligned_lyrics
    }))

if __name__ == "__main__":
    main()
