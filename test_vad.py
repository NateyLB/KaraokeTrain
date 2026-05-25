import os
os.environ["KMP_DUPLICATE_LIB_OK"]="TRUE"

import json
from faster_whisper import WhisperModel

model = WhisperModel("base", device="cpu", compute_type="int8")
prompt = "I got my peaches out in Georgia"

segments_gen, _ = model.transcribe(
    "/Users/Nate/Desktop/GenAIProjects/KaraokeStreaming/uploads/aa4b4023-2682-4e9c-8150-3d5a90e2f395/htdemucs/input/vocals.wav",
    word_timestamps=True,
    condition_on_previous_text=False,
    initial_prompt=prompt,
    vad_filter=True
)

res = []
for s in segments_gen:
    res.append(s.text)

print(json.dumps(res))
