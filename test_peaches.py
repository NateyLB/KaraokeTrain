import os
os.environ["KMP_DUPLICATE_LIB_OK"]="TRUE"
from faster_whisper import WhisperModel

def main():
    model = WhisperModel("base", device="cpu", compute_type="int8")
    
    segments_gen, _ = model.transcribe(
        '/Users/Nate/Desktop/GenAIProjects/KaraokeStreaming/uploads/aa4b4023-2682-4e9c-8150-3d5a90e2f395/htdemucs/input/vocals.wav', 
        word_timestamps=True, 
        condition_on_previous_text=False, 
        no_speech_threshold=0.4,
        vad_filter=False
    )
    
    for s in segments_gen:
        if s.no_speech_prob > 0.4:
            continue
        print(s.text.strip())

if __name__ == "__main__":
    main()
