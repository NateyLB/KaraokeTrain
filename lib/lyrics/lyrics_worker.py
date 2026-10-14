"""Transcribe independently; only then validate and align external lyrics."""
import os
os.environ['KMP_DUPLICATE_LIB_OK'] = 'TRUE'
import argparse
import json
import sys
from lyrics_alignment import align_lyrics
from transcription import DEFAULT_MODEL, TRANSCRIPTION_VERSION, transcribe_audio, needs_original_mix, choose_transcript


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--wav')
    parser.add_argument('--original_mix')
    parser.add_argument('--compare_sources', action='store_true')
    parser.add_argument('--lyrics_file', required=True)
    parser.add_argument('--transcript_file', required=True)
    args = parser.parse_args()
    provider = os.environ.get('LYRICS_ASR_PROVIDER', 'qwen')
    if provider not in ('qwen', 'whisper'):
        raise ValueError('Unsupported transcription provider')
    with open(args.lyrics_file, encoding='utf-8') as file:
        candidates = json.load(file)
    transcript = None
    if os.path.exists(args.transcript_file):
        with open(args.transcript_file, encoding='utf-8') as file:
            cached = json.load(file)
        if cached.get('independent') and ((provider == 'qwen' and cached.get('version') == 3 and cached.get('provider') == 'qwen') or
                (provider == 'whisper' and cached.get('version') == TRANSCRIPTION_VERSION)):
            transcript = cached
    if transcript is None and provider == 'qwen':
        if not args.wav:
            raise ValueError('Separated vocals required to upgrade this transcription')
        from qwen_transcription import transcribe_qwen
        report = lambda progress: print(f'PROGRESS:{progress}', file=sys.stderr, flush=True)
        transcript = transcribe_qwen(args.wav, report)
        temporary = args.transcript_file + f'.{os.getpid()}.tmp'
        with open(temporary, 'w', encoding='utf-8') as file:
            json.dump(transcript, file, ensure_ascii=False)
        os.replace(temporary, args.transcript_file)
    if transcript is None:
        if not args.wav:
            raise ValueError('No independent transcript or vocals available')
        from faster_whisper import WhisperModel
        model_name = os.environ.get('WHISPER_MODEL', DEFAULT_MODEL)
        # int8 bounds CPU memory on local machines; CUDA retains accelerated defaults.
        import ctranslate2
        device = 'cuda' if ctranslate2.get_cuda_device_count() else 'cpu'
        model = WhisperModel(model_name, device=device, compute_type='int8' if device == 'cpu' else 'float16')
        report = lambda progress: print(f'PROGRESS:{progress}', file=sys.stderr, flush=True)
        transcript = transcribe_audio(model, args.wav, 'isolated_vocals', report)
        if args.original_mix and (args.compare_sources or needs_original_mix(transcript)):
            print('STAGE:Comparing original audio transcription', file=sys.stderr, flush=True)
            alternative = transcribe_audio(model, args.original_mix, 'original_mix', report,
                language=transcript['language'] if transcript['languageProbability'] >= .8 else None)
            comparison = {'isolated_vocals': transcript['quality'], 'original_mix': alternative['quality']}
            if args.compare_sources:
                with open(args.transcript_file + '.comparison.json', 'w', encoding='utf-8') as file:
                    json.dump({'vocals': transcript, 'original': alternative}, file, ensure_ascii=False)
            transcript = choose_transcript(transcript, alternative)
            transcript['sourceComparison'] = comparison
        transcript['model'] = model_name
        transcript['provider'] = 'whisper'
        temporary = args.transcript_file + f'.{os.getpid()}.tmp'
        with open(temporary, 'w', encoding='utf-8') as file:
            json.dump(transcript, file, ensure_ascii=False)
        os.replace(temporary, args.transcript_file)
    result = align_lyrics(candidates, transcript)
    result['transcription'] = transcript
    print(json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    main()
