import re

with open('lib/whisper_align.py', 'r') as f:
    content = f.read()

# Replace prompt block
prompt_old = """    # Construct an initial prompt to bias Whisper toward the correct lyrics/vocabulary
    prompt_text = "Vocals, singing, clear lyrics."
    if lrclib_data:
        lyrics_sample = " ".join([l.get("text", "") for l in lrclib_data[:15] if l.get("text")]).strip()
        if lyrics_sample:
            prompt_text = lyrics_sample"""

prompt_new = """    # Construct an initial prompt to bias Whisper toward the correct lyrics/vocabulary
    prompt_text = "Vocals, singing, clear lyrics."
    if lrclib_data:
        versions = lrclib_data if (isinstance(lrclib_data, list) and len(lrclib_data) > 0 and "lines" in lrclib_data[0]) else [{"label": "Default", "isKorean": False, "lines": lrclib_data}]
        lyrics_sample = " ".join([l.get("text", "") for l in versions[0].get("lines", [])[:15] if l.get("text")]).strip()
        if lyrics_sample:
            prompt_text = lyrics_sample"""

content = content.replace(prompt_old, prompt_new)

# Find where the alignment logic begins
start_marker = """    if not lrclib_data:
        # Return pure whisper transcription with precise words"""
end_marker = """if __name__ == "__main__":"""

start_idx = content.find(start_marker)
end_idx = content.find(end_marker)

new_alignment_logic = """    if not lrclib_data:
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

    # Flatten all whisper words
    whisper_words_flat = []
    for s in whisper_segments:
        whisper_words_flat.extend(s.get("words", []))
        
    whisper_texts = [normalize_text(w["word"].strip()) for w in whisper_words_flat]
    
    versions = lrclib_data if (isinstance(lrclib_data, list) and len(lrclib_data) > 0 and "lines" in lrclib_data[0]) else [{"label": "Default", "isKorean": False, "lines": lrclib_data}]
    
    final_versions = []
    
    for version in versions:
        lrclib_lines = []
        lrclib_line_times = []
        
        for l in version.get("lines", []):
            if l.get("text", "").strip():
                lrclib_lines.append(l["text"].strip())
                lrclib_line_times.append(l.get("time", 0.0))
                
        # Flatten all lrclib words
        lrclib_words_flat = []
        word_to_line = []
        for line_idx, line in enumerate(lrclib_lines):
            words = line.split()
            for w in words:
                lrclib_words_flat.append(w)
                word_to_line.append(line_idx)
                
        lrclib_texts = [normalize_text(w) for w in lrclib_words_flat]
        
        sm = difflib.SequenceMatcher(None, lrclib_texts, whisper_texts)
        
        # Calculate global offset to handle live versions vs studio versions
        global_offset = 0.0
        if lrclib_line_times:
            matched_offsets = []
            for tag, i1, i2, j1, j2 in sm.get_opcodes():
                if tag == 'equal':
                    for k in range(i2 - i1):
                        lrclib_idx = i1 + k
                        whisper_idx = j1 + k
                        line_idx = word_to_line[lrclib_idx]
                        
                        if line_idx < len(lrclib_line_times):
                            w_data = whisper_words_flat[whisper_idx]
                            
                            words_before_in_line = 0
                            idx = lrclib_idx - 1
                            while idx >= 0 and word_to_line[idx] == line_idx:
                                words_before_in_line += 1
                                idx -= 1
                                
                            estimated_line_start = w_data["start"] - (words_before_in_line * 0.33)
                            diff = estimated_line_start - lrclib_line_times[line_idx]
                            matched_offsets.append(diff)
                            
            if matched_offsets:
                matched_offsets.sort()
                global_offset = matched_offsets[len(matched_offsets) // 2]
                
            if abs(global_offset) > 1.0:
                lrclib_line_times = [max(0.0, t + global_offset) for t in lrclib_line_times]
        
        curr_whisper_texts = whisper_texts
        curr_whisper_words_flat = whisper_words_flat
        curr_whisper_segments = whisper_segments
        
        if sm.ratio() < 0.15:
            if lrclib_line_times:
                curr_whisper_texts = []
                curr_whisper_words_flat = []
                curr_whisper_segments = []
                sm = difflib.SequenceMatcher(None, lrclib_texts, curr_whisper_texts)
            else:
                final_versions.append({
                    "label": version.get("label", "Default"),
                    "isKorean": version.get("isKorean", False),
                    "lyrics": [{"time": s["start"], "text": s["text"], "words": s["words"]} for s in curr_whisper_segments]
                })
                continue
        
        mapped_flat_words = []
        for tag, i1, i2, j1, j2 in sm.get_opcodes():
            if tag == 'equal':
                for k in range(i2 - i1):
                    w_text = lrclib_words_flat[i1 + k]
                    w_data = curr_whisper_words_flat[j1 + k]
                    mapped_flat_words.append({"word": w_text, "start": w_data["start"], "end": w_data["end"], "line_idx": word_to_line[i1 + k]})
            else:
                if j2 > j1 and len(curr_whisper_words_flat) > 0:
                    block_start = curr_whisper_words_flat[j1]["start"]
                    block_end = curr_whisper_words_flat[j2 - 1]["end"]
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
                else:
                    if not mapped_flat_words:
                        block_start = 0.0
                    else:
                        block_start = mapped_flat_words[-1]["end"]
                        
                    if lrclib_line_times:
                        if i1 < len(word_to_line):
                            first_word_line = word_to_line[i1]
                            target_time = lrclib_line_times[first_word_line]
                            if target_time > block_start:
                                block_start = target_time
                            
                    extrapolated_end = block_start + 0.3 * (i2 - i1)
                    
                    if j2 < len(curr_whisper_words_flat):
                        next_valid_start = curr_whisper_words_flat[j2]["start"]
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
                        
        aligned_lyrics = []
        for line_idx, line in enumerate(lrclib_lines):
            line_words = []
            for w in mapped_flat_words:
                if w.get("line_idx") == line_idx:
                    w_copy = {k: v for k, v in w.items() if k != "line_idx"}
                    line_words.append(w_copy)
                
            time_start = lrclib_line_times[line_idx] if line_idx < len(lrclib_line_times) else (line_words[0]["start"] if line_words else 0)
            aligned_lyrics.append({"time": time_start, "text": line, "words": line_words})
                
        final_versions.append({
            "label": version.get("label", "Default"),
            "isKorean": version.get("isKorean", False),
            "lyrics": aligned_lyrics
        })

    if len(final_versions) == 1 and final_versions[0]["label"] == "Default":
        print(json.dumps({
            "source": "lrclib_aligned",
            "lyrics": final_versions[0]["lyrics"]
        }))
    else:
        print(json.dumps({
            "source": "lrclib_aligned_multi",
            "lyrics": final_versions
        }))

"""

content = content[:start_idx] + new_alignment_logic + "\n" + content[end_idx:]

with open('lib/whisper_align.py', 'w') as f:
    f.write(content)

