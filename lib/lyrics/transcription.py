"""Independent singing transcription with measurable quality and safe audio fallback."""
import math

TRANSCRIPTION_VERSION = 2
DEFAULT_MODEL = 'large-v3-turbo'


def quality(segments):
    words = [word for segment in segments for word in segment.get('words', [])]
    probabilities = [word.get('probability', 0) for word in words]
    mean = sum(probabilities) / max(1, len(probabilities))
    low_fraction = sum(probability < .45 for probability in probabilities) / max(1, len(probabilities))
    log_prob = sum(segment.get('avgLogprob', -2) for segment in segments) / max(1, len(segments))
    return {'meanWordProbability': round(mean, 3), 'lowConfidenceFraction': round(low_fraction, 3),
            'meanLogProbability': round(log_prob, 3), 'wordCount': len(words),
            'score': round(mean - .25 * low_fraction, 3)}


def choose_transcript(primary, alternative):
    if not alternative['segments']:
        return primary
    if not primary['segments']:
        return alternative
    # Higher confidence must not come from dropping most of the performance.
    enough_words = alternative['quality']['wordCount'] >= .75 * primary['quality']['wordCount']
    if enough_words and alternative['quality']['score'] > primary['quality']['score'] + .03:
        return alternative
    return primary


def needs_original_mix(transcript):
    stats = transcript['quality']
    return not transcript['segments'] or stats['meanWordProbability'] < .75 or stats['lowConfidenceFraction'] > .20


def transcribe_audio(model, audio_path, source, on_progress=None, language=None):
    from faster_whisper.audio import decode_audio
    audio = decode_audio(audio_path, sampling_rate=16000)
    duration = len(audio) / 16000
    segments, info = model.transcribe(
        audio, language=language, word_timestamps=True, beam_size=5,
        temperature=0, condition_on_previous_text=False,
        no_speech_threshold=.6, log_prob_threshold=-1.0,
        hallucination_silence_threshold=2,
        vad_filter=source == 'isolated_vocals', vad_parameters=dict(threshold=.35, min_speech_duration_ms=100,
            min_silence_duration_ms=1000, speech_pad_ms=400),
        language_detection_segments=3,
        # Candidate lyrics must never enter the independent transcription prompt.
    )
    timed = []
    for segment in segments:
        words = [{'word': word.word.strip(), 'start': max(0, float(word.start)), 'end': min(duration, float(word.end)),
                  'probability': float(word.probability)}
                 for word in (segment.words or []) if word.word.strip() and
                 math.isfinite(word.start) and math.isfinite(word.end) and word.end > word.start]
        if words and segment.text.strip() and segment.avg_logprob >= -1.2:
            timed.append({'start': words[0]['start'], 'end': words[-1]['end'], 'text': segment.text.strip(),
                          'words': words, 'avgLogprob': float(segment.avg_logprob),
                          'noSpeechProbability': float(segment.no_speech_prob)})
        if on_progress:
            on_progress(min(100, int(segment.end / max(duration, 1) * 100)))
    return {'version': TRANSCRIPTION_VERSION, 'independent': True, 'language': info.language,
            'languageProbability': float(info.language_probability), 'audioSource': source,
            'duration': duration, 'segments': timed, 'quality': quality(timed)}
