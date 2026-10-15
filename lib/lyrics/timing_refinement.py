"""Refine Qwen text timing from an independent, confident audio timing pass."""
import copy
import unicodedata
from qwen_transcription import group_words


def normalized(text):
    return ''.join(char for char in unicodedata.normalize('NFKC', text).lower() if char.isalnum())


def extend_sustained_words(words, audio, sample_rate):
    import numpy as np
    frame_size = max(1, int(sample_rate * .02))
    count = len(audio) // frame_size
    if not count:
        return 0
    rms = np.sqrt(np.mean(audio[:count*frame_size].reshape(count,frame_size) ** 2, axis=1))
    noise = float(np.percentile(rms, 15))
    extended = 0
    for idx, word in enumerate(words):
        limit = min(word['end'] + 3, len(audio)/sample_rate,
                    words[idx+1]['start'] - .02 if idx+1 < len(words) else float('inf'))
        if limit - word['end'] < .12:
            continue
        start_frame = max(0, int(word['start']/.02))
        end_frame = min(count-1, int(word['end']/.02))
        peak = float(np.max(rms[start_frame:end_frame+1])) if end_frame >= start_frame else 0
        threshold = max(.002, noise*3, peak*.15)
        # Speech timestamps sometimes start a word inside a preceding silent gap.
        if word['end']-word['start'] > .2 and rms[start_frame] < threshold:
            for frame in range(start_frame+1, end_frame-3):
                if np.all(rms[frame:frame+4] >= threshold):
                    onset = frame*.02
                    if onset-word['start'] >= .1:
                        word['start'] = onset
                        word['onsetRefined'] = True
                    break
        if rms[end_frame] < threshold:
            continue
        silent = 0
        stop = word['end']
        for frame in range(end_frame, min(count,int(limit/.02))):
            silent = silent+1 if rms[frame] < threshold else 0
            if silent >= 6:
                stop = max(word['end'], (frame-5)*.02)
                break
            stop = min(limit,(frame+1)*.02)
        if stop - word['end'] >= .08:
            word['end'] = stop
            word['sustainRefined'] = True
            extended += 1
    return extended


def refine_timing(transcript, reference, audio=None, sample_rate=16000):
    result = copy.deepcopy(transcript)
    words = [word for segment in result['segments'] for word in segment['words']]
    actual = [word for segment in reference['segments'] for word in segment['words']]
    # A text-only matcher can choose the wrong copy of a repeated chorus, then
    # lose anchors when we reject its distant timestamps. Score time proximity
    # DURING monotonic sequence alignment rather than checking it afterward.
    rows = [[0.] * (len(actual)+1) for _ in range(len(words)+1)]
    directions = [bytearray(len(actual)+1) for _ in range(len(words)+1)]
    for i, word in enumerate(words,1):
        for j, evidence in enumerate(actual,1):
            above, left = rows[i-1][j], rows[i][j-1]
            rows[i][j], directions[i][j] = (above,1) if above >= left else (left,2)
            distance = abs(word['start']-evidence['start'])
            minimum_confidence = .3 if word['end']-word['start'] <= .021 else .55
            if (normalized(word['word']) == normalized(evidence['word']) and distance <= 2.5 and
                    evidence.get('probability',0) >= minimum_confidence):
                score = rows[i-1][j-1] + 1 + evidence['probability']*.2 - distance*.12
                if score > rows[i][j]:
                    rows[i][j], directions[i][j] = score,3
    anchors = {}
    i,j = len(words),len(actual)
    while i and j:
        if directions[i][j] == 3:
            anchors[i-1] = actual[j-1]
            i,j = i-1,j-1
        elif directions[i][j] == 1:
            i -= 1
        else:
            j -= 1
    coverage = len(anchors) / max(1, len(words))
    stats = {'version': 1, 'backend': 'whisper-large-v3-turbo', 'matchedWords': len(anchors),
             'coverage': round(coverage, 3), 'accepted': coverage >= .5 and len(anchors) >= 8}
    if not stats['accepted']:
        result['timingValidation'] = stats
        return result
    for idx, evidence in anchors.items():
        words[idx].update(start=evidence['start'], end=evidence['end'], timingSource='audio_reference')
    ordered = sorted(anchors)
    interpolated = 0
    for left, right in zip(ordered, ordered[1:]):
        missing = right - left - 1
        gap = words[right]['start'] - words[left]['end']
        # Keep plausible Qwen boundaries for unmatched words. Filling the entire
        # interval would assign held vocals or an instrumental pause to "there".
        plausible = all(words[idx]['start'] >= words[left]['end'] and
                        words[idx]['start'] < words[right]['start'] and
                        words[idx]['end']-words[idx]['start'] > .06 for idx in range(left+1,right))
        if missing and plausible:
            for idx in range(left+1,right):
                words[idx]['end'] = min(words[idx]['end'], words[right]['start'])
                words[idx]['timingSource'] = 'qwen'
            continue
        outside_bounds = any(words[idx]['start'] >= words[right]['start'] for idx in range(left+1,right))
        if 0 < missing <= 4 and .03 * missing <= gap <= (4 if outside_bounds else min(2,missing*.7)):
            total = sum(max(1, len(normalized(words[idx]['word']))) for idx in range(left+1, right))
            cursor = words[left]['end']
            for idx in range(left+1, right):
                duration = gap * max(1, len(normalized(words[idx]['word']))) / total
                words[idx].update(start=cursor, end=cursor+duration, timingSource='interpolated')
                cursor += duration
                interpolated += 1
    # Resolve remaining overlaps backwards. Pushing a trusted onset forwards
    # behind an old untrusted interval can move words into the next verse.
    for idx in range(len(words)-2,-1,-1):
        word, following = words[idx],words[idx+1]
        word['end'] = min(word['end'],following['start'])
        if word['start'] >= word['end']:
            word['start'] = word['end']-.02
    valid = [word for word in words if 0 <= word['start'] < word['end'] <= result['duration']]
    # A timing correction must never silently drop correctly transcribed words.
    if len(valid) != len(words) or any(words[idx]['end'] > words[idx+1]['start'] for idx in range(len(words)-1)):
        fallback = copy.deepcopy(transcript)
        fallback['timingValidation'] = {**stats, 'accepted': False, 'reason': 'invalid_intervals'}
        return fallback
    extended = extend_sustained_words(words, audio, sample_rate) if audio is not None else 0
    result['segments'] = group_words(words)
    result['timingVersion'] = 1
    result['timingReference'] = reference
    result['timingValidation'] = {**stats, 'interpolatedWords': interpolated, 'sustainsExtended': extended,
        'onsetsRefined': sum(bool(w.get('onsetRefined')) for w in words),
        'collapsedBefore': sum(bool(w['end']-w['start'] <= .021) for s in transcript['segments'] for w in s['words']),
        'collapsedAfter': sum(bool(w['end']-w['start'] <= .021) for w in words)}
    return result
