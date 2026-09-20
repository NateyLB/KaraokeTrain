import os
os.environ["KMP_DUPLICATE_LIB_OK"]="TRUE"
from faster_whisper import WhisperModel

def main():
    model = WhisperModel("base", device="cpu", compute_type="int8")
    
    segments_gen, _ = model.transcribe(
        '/Users/Nate/Desktop/GenAIProjects/KaraokeStreaming/uploads/407269db-2085-4a93-bbef-c0019e683fe5/htdemucs/input/vocals.wav', 
        word_timestamps=True, 
        condition_on_previous_text=False, 
        no_speech_threshold=0.9,
        vad_filter=True,
        vad_parameters=dict(min_silence_duration_ms=500)
    )
    
    total = 0
    for s in segments_gen:
        total += len(s.words)
    print(f"Total words: {total}")

if __name__ == "__main__":
    main()
