"""Qwen singing ASR followed by alignment of its own independent transcript."""
import math
import os
import re
import subprocess
import sys

DEFAULT_QWEN_MODEL = 'Qwen/Qwen3-ASR-1.7B'
DEFAULT_ALIGNER = 'Qwen/Qwen3-ForcedAligner-0.6B'


def group_words(words):
    """Bound display lines without stretching text across instrumental gaps."""
    segments, group = [], []

    def text_for(items):
        text = ''
        for word in items:
            token = word['word']
            # Native Japanese/Chinese tokens should remain contiguous.
            separator = '' if (text and re.search(r'[\u3040-\u30ff\u3400-\u9fff]$', text) and
                re.match(r'^[\u3040-\u30ff\u3400-\u9fff]', token)) else ' '
            text += (separator if text else '') + token
        return text

    def flush():
        if group:
            # An eight-word limit often leaves a dangling final "way" or "hurt".
            # Rejoin a tiny tail within the same phrase without crossing pauses.
            previous = segments[-1] if segments else None
            if (previous and len(group) <= 2 and len(previous['words']) + len(group) <= 10 and
                not re.search(r'[.!?。！？]$', previous['words'][-1]['word']) and
                group[0]['start'] - previous['end'] <= 1.2 and group[-1]['end'] - previous['start'] <= 9):
                previous['words'].extend(group)
                previous['end'] = group[-1]['end']
                previous['text'] = text_for(previous['words'])
            else:
                segments.append({'start': group[0]['start'], 'end': group[-1]['end'],
                                 'text': text_for(group), 'words': list(group)})
            group.clear()

    for word in words:
        if group and (word['start'] - group[-1]['end'] > 1.2 or len(group) >= 8 or
                      word['end'] - group[0]['start'] > 8):
            flush()
        group.append(word)
        if re.search(r'[.!?。！？]$', word['word']):
            flush()
    flush()
    return segments


def timed_words(items, offset, duration):
    words = []
    previous_end = offset
    for item in items:
        start, end = offset + float(item.start_time), offset + float(item.end_time)
        if not (math.isfinite(start) and math.isfinite(end)):
            continue
        start = max(offset, previous_end, start)
        # The aligner quantizes time and can give short words a zero-width span.
        # Keep the independently transcribed word with a minimal interval; never
        # drop "of", "to", etc. or extend beyond this audio chunk.
        end = min(duration, max(start + .02, end))
        if end <= start or not item.text.strip():
            continue
        words.append({'word': item.text.strip(), 'start': start, 'end': end})
        previous_end = end
    return words


def restore_punctuation(words, text):
    """The timing model removes punctuation; retain the ASR's original spelling."""
    def normalize(token):
        return ''.join(char for char in token.lower() if char.isalnum())
    tokens = text.split()
    if len(tokens) == len(words) and all(normalize(token) == normalize(word['word'])
                                       for token, word in zip(tokens, words)):
        return [{**word, 'word': token} for word, token in zip(words, tokens)]
    return words


def transcribe_qwen(audio_path, on_progress=None):
    import numpy as np
    import torch
    from qwen_asr import Qwen3ASRModel
    from qwen_asr.inference.utils import split_audio_into_chunks
    model_name = os.environ.get('QWEN_ASR_MODEL', DEFAULT_QWEN_MODEL)
    aligner_name = os.environ.get('QWEN_ALIGNER_MODEL', DEFAULT_ALIGNER)
    device = os.environ.get('ASR_DEVICE') or ('cuda:0' if torch.cuda.is_available() else
              'mps' if torch.backends.mps.is_available() else 'cpu')
    dtype = torch.float32 if device == 'cpu' else torch.float16
    print(f'STAGE:Loading Qwen ASR and word aligner on {device}', file=sys.stderr, flush=True)
    model = Qwen3ASRModel.from_pretrained(model_name, dtype=dtype, device_map=device,
        attn_implementation='eager', max_inference_batch_size=1, max_new_tokens=256,
        forced_aligner=aligner_name,
        forced_aligner_kwargs={'dtype': dtype, 'device_map': device, 'attn_implementation': 'eager'})
    # Decode locally without sending song audio to a cloud transcription service.
    decoded = subprocess.run(['ffmpeg', '-v', 'error', '-i', audio_path,
        '-f', 'f32le', '-ac', '1', '-ar', '16000', '-'], capture_output=True, check=True)
    audio = np.frombuffer(decoded.stdout, dtype=np.float32).copy()
    duration = len(audio) / 16000
    if not duration:
        raise ValueError('Empty audio')
    chunks = split_audio_into_chunks(wav=audio, sr=16000, max_chunk_sec=30)
    segments, raw_chunks, languages = [], [], []
    for chunk_audio, offset in chunks:
        # Silence alone cannot authorize text, even with a forced aligner.
        if np.sqrt(np.mean(chunk_audio ** 2)) < 1e-4:
            continue
        print(f'STAGE:Transcribing vocals at {offset:.1f}s', file=sys.stderr, flush=True)
        result = model.transcribe(audio=(chunk_audio, 16000), context='', return_time_stamps=True)[0]
        words = timed_words(result.time_stamps.items if result.time_stamps else [], offset,
                            min(duration, offset + len(chunk_audio) / 16000))
        words = restore_punctuation(words, result.text)
        segments.extend(group_words(words))
        raw_chunks.append({'offset': offset, 'text': result.text, 'language': result.language})
        languages.append(result.language)
        if on_progress:
            on_progress(min(100, int((offset + len(chunk_audio) / 16000) / duration * 100)))
    return {'version': 3, 'independent': True, 'provider': 'qwen', 'model': model_name,
            'aligner': aligner_name, 'device': device, 'language': ','.join(dict.fromkeys(languages)),
            'audioSource': 'isolated_vocals', 'duration': duration, 'segments': segments,
            'rawChunks': raw_chunks}
