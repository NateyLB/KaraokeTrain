import argparse
import json
import os
import sys
import subprocess
from lyrics_alignment import align_lyrics
from timing_refinement import refine_timing


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--wav', required=True)
    parser.add_argument('--transcript_file', required=True)
    parser.add_argument('--lyrics_file', required=True)
    args = parser.parse_args()
    with open(args.transcript_file, encoding='utf-8') as file:
        transcript = json.load(file)
    reference = transcript.get('timingReference')
    if reference is None:
        from faster_whisper import WhisperModel
        import ctranslate2
        from transcription import transcribe_audio
        device = 'cuda' if ctranslate2.get_cuda_device_count() else 'cpu'
        model = WhisperModel('large-v3-turbo', device=device, compute_type='float16' if device == 'cuda' else 'int8')
        report = lambda progress: print(f'PROGRESS:{progress}', file=sys.stderr, flush=True)
        reference = transcribe_audio(model, args.wav, 'timing_reference', report)
    import numpy as np
    decoded = subprocess.run(['ffmpeg','-v','error','-i',args.wav,'-f','f32le','-ac','1','-ar','16000','-'],
                             capture_output=True, check=True)
    audio = np.frombuffer(decoded.stdout,dtype=np.float32).copy()
    refined = refine_timing(transcript, reference, audio)
    with open(args.lyrics_file, encoding='utf-8') as file:
        candidates = json.load(file)
    result = align_lyrics(candidates, refined)
    result['transcription'] = refined
    temporary = args.transcript_file + f'.{os.getpid()}.tmp'
    with open(temporary, 'w', encoding='utf-8') as file:
        json.dump(refined, file, ensure_ascii=False)
    os.replace(temporary, args.transcript_file)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    main()
