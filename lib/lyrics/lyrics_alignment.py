"""Pure validation/alignment; studio timestamps never authorize display timing."""
import math
import unicodedata
from sequence_alignment import monotonic_matches

ENGINE_VERSION = 4


def units(text):
    normalized = ''.join(char for char in unicodedata.normalize('NFKC', text).lower() if char.isalnum())
    if any('\u3040' <= char <= '\u9fff' or '\uac00' <= char <= '\ud7a3' for char in normalized):
        return list(normalized)
    return [normalized] if normalized else []


def flatten(lines, transcript=False):
    tokens, owners, words = [], [], []
    for line_idx, line in enumerate(lines):
        source = line.get('words', []) if transcript else [{'word': word} for word in line['text'].split()]
        for word in source:
            pieces = units(word['word'])
            if not pieces:
                continue
            word_idx = len(words)
            words.append({**word, 'line_idx': line_idx})
            tokens.extend(pieces)
            owners.extend([word_idx] * len(pieces))
    return tokens, owners, words


def fallback(transcript):
    duration = transcript.get('duration', float('inf'))
    lines = []
    for segment in transcript.get('segments', []):
        words = []
        for word in segment.get('words', []):
            start, end = word.get('start', -1), word.get('end', -1)
            if not (math.isfinite(start) and math.isfinite(end) and 0 <= start < end <= duration):
                continue
            words.append(dict(word))
        if words:
            lines.append({'time': words[0]['start'], 'text': segment['text'], 'words': words})
    return sorted(lines, key=lambda line: line['time'])


def evaluate(candidate, transcript_lines):
    lines = [line for line in candidate.get('lines', []) if line.get('text', '').strip()]
    reference, ref_owners, ref_words = flatten(lines)
    actual, actual_owners, actual_words = flatten(transcript_lines, transcript=True)
    anchors = {}
    matched_tokens = []
    for ref_idx, actual_idx in monotonic_matches(reference, actual):
        anchors.setdefault(ref_owners[ref_idx], []).append(actual_words[actual_owners[actual_idx]])
        matched_tokens.append(reference[ref_idx])
    matched = len(matched_tokens)
    reference_coverage = matched / max(1, len(reference))
    transcript_coverage = matched / max(1, len(actual))
    ratio = 2 * matched / max(1, len(reference) + len(actual))
    accepted = (candidate.get('exactMatch') is True and matched >= 8 and len(set(matched_tokens)) >= 4 and
                reference_coverage >= .40 and transcript_coverage >= .50 and ratio >= .52)
    diagnostics = {'id': candidate.get('id'), 'trackName': candidate.get('trackName'),
                   'artistName': candidate.get('artistName'), 'accepted': accepted,
                   'matchedTokens': matched, 'referenceCoverage': round(reference_coverage, 3),
                   'transcriptCoverage': round(transcript_coverage, 3), 'score': round(ratio, 3)}
    return diagnostics, lines, ref_words, anchors


def verify_cached_timing(lines, transcript):
    """Check saved word intervals against independent Qwen audio evidence."""
    missing = sum(bool(line.get('text', '').strip()) and not line.get('words') for line in lines)
    timed_lines = [{**line, 'words': line.get('words') or []} for line in lines]
    old_tokens, old_owners, old_words = flatten(timed_lines, transcript=True)
    new_tokens, new_owners, new_words = flatten(fallback(transcript), transcript=True)
    # Time only breaks ties between equally strong text matches. Its total bonus
    # is less than one token, so old timestamps cannot outweigh audio/text evidence.
    bonus = 1 / (max(len(old_tokens), len(new_tokens)) + 1)
    def score(old_idx, new_idx):
        old, new = old_words[old_owners[old_idx]], new_words[new_owners[new_idx]]
        start = old.get('start')
        return 1 + bonus / (1 + abs(start - new['start'])) if isinstance(start, (int, float)) and math.isfinite(start) else 1
    pairs = {(old_owners[old_idx], new_owners[new_idx])
             for old_idx, new_idx in monotonic_matches(old_tokens, new_tokens, score)}
    starts, ends, matched = [], [], set()
    invalid = sum(not (isinstance(word.get('start'), (int, float)) and isinstance(word.get('end'), (int, float)) and
        math.isfinite(word['start']) and math.isfinite(word['end']) and 0 <= word['start'] < word['end'] <= transcript['duration'])
        for word in old_words)
    for old_idx, new_idx in pairs:
        old, new = old_words[old_idx], new_words[new_idx]
        if isinstance(old.get('start'), (int, float)) and isinstance(old.get('end'), (int, float)):
            if math.isfinite(old['start']) and math.isfinite(old['end']):
                starts.append(abs(old['start'] - new['start']))
                ends.append(abs(old['end'] - new['end']))
                matched.add(old_idx)
    def percentile(values, fraction):
        return round(sorted(values)[min(len(values) - 1, int((len(values) - 1) * fraction))], 3) if values else None
    coverage = len(matched) / max(1, len(old_words))
    enough = (transcript.get('provider') == 'qwen' and transcript.get('independent') is True and
              len(matched) >= 8 and coverage >= .75 and len(set(old_tokens)) >= 4)
    stats = {'provider': transcript.get('provider'), 'matchedWords': len(matched), 'referenceWords': len(old_words),
             'missingTimedLines': missing,
             'coverage': round(coverage, 3), 'invalidIntervals': invalid,
             'medianStartError': percentile(starts, .5), 'p90StartError': percentile(starts, .9),
             'medianEndError': percentile(ends, .5), 'p90EndError': percentile(ends, .9)}
    stats['aligned'] = bool(enough and not invalid and not missing and stats['medianStartError'] <= .25 and
                            stats['p90StartError'] <= .7 and stats['p90EndError'] <= 1)
    stats['reason'] = 'verified' if stats['aligned'] else 'timing_drift' if enough else 'insufficient_text_evidence'
    return stats


def aligned_lines(lines, words, anchors):
    output = []
    for line_idx, line in enumerate(lines):
        indices = [idx for idx, word in enumerate(words) if word['line_idx'] == line_idx]
        matches = [idx for idx in indices if idx in anchors]
        if len(matches) / max(1, len(indices)) < .60 or len(matches) < min(2, len(indices)):
            continue
        timed = {}
        for idx in matches:
            evidence = anchors[idx]
            timed[idx] = {'word': words[idx]['word'], 'start': min(w['start'] for w in evidence),
                          'end': max(w['end'] for w in evidence)}
        # Interpolate at most two omissions bounded by real matches in this line.
        for left, right in zip(matches, matches[1:]):
            count = right - left - 1
            gap = timed[right]['start'] - timed[left]['end']
            if 0 < count <= 2 and .02 * count <= gap <= 3:
                for offset in range(count):
                    idx = left + offset + 1
                    timed[idx] = {'word': words[idx]['word'],
                                  'start': timed[left]['end'] + gap * offset / count,
                                  'end': timed[left]['end'] + gap * (offset + 1) / count}
        # Unsupported edges/verses remain transcription rather than fabricated lyrics.
        if any(idx not in timed for idx in indices):
            continue
        line_words = [timed[idx] for idx in indices]
        if any(line_words[idx]['start'] - line_words[idx - 1]['end'] > 8
               for idx in range(1, len(line_words))):
            continue  # Do not stretch a partial chorus across an instrumental break.
        for idx in range(1, len(line_words)):
            previous, current = line_words[idx - 1], line_words[idx]
            if previous['end'] > current['start']:
                boundary = (previous['start'] + current['end']) / 2
                previous['end'] = boundary
                current['start'] = boundary
        if any(word['end'] <= word['start'] for word in line_words):
            continue
        output.append({'time': line_words[0]['start'], 'text': line['text'],
                       'words': line_words, 'referenceLine': line_idx})
    return output


def merge_transcription(aligned, actual):
    intervals = [(line['words'][0]['start'], line['words'][-1]['end']) for line in aligned]
    remainder = []
    for line in actual:
        kept = []
        for word in line['words']:
            midpoint = (word['start'] + word['end']) / 2
            if not any(start <= midpoint <= end for start, end in intervals):
                kept.append(dict(word))
            elif kept:
                remainder.append({'time': kept[0]['start'], 'text': ' '.join(w['word'] for w in kept), 'words': kept})
                kept = []
        if kept:
            remainder.append({'time': kept[0]['start'], 'text': ' '.join(w['word'] for w in kept), 'words': kept})
    cleaned = [{key: value for key, value in line.items() if key != 'referenceLine'} for line in aligned]
    return sorted(cleaned + remainder, key=lambda line: line['time'])


def align_lyrics(candidates, transcript):
    is_qwen = transcript.get('provider') == 'qwen'
    fallback_source = 'qwen_transcription' if is_qwen else 'whisper_fallback'
    aligned_source = 'lrclib_qwen_aligned' if is_qwen else 'lrclib_aligned'
    actual = fallback(transcript)
    evaluations = [(candidate, evaluate(candidate, actual)) for candidate in candidates
                   if candidate.get('derivedFrom') is None]
    diagnostics = [result[0] for _, result in evaluations]
    accepted = [(candidate, result) for candidate, result in evaluations if result[0]['accepted']]
    base = {'lyricsEngineVersion': ENGINE_VERSION, 'validation': {'candidates': diagnostics,
            'independentTranscription': True, 'reason': 'no_exact_match' if not candidates else 'transcription_mismatch'}}
    cached = next((candidate for candidate in candidates if candidate.get('cached')), None)
    if cached:
        base['cacheTiming'] = verify_cached_timing(cached['lines'], transcript)
    if not accepted:
        return {**base, 'source': fallback_source, 'lyrics': actual}
    candidate, result = max(accepted, key=lambda entry: entry[1][0]['score'])
    aligned = aligned_lines(result[1], result[2], result[3])
    if not aligned:
        base['validation']['reason'] = 'insufficient_timing_evidence'
        return {**base, 'source': fallback_source, 'lyrics': actual}
    base['validation'].update({'reason': 'validated', 'selected': result[0],
                               'alignedLines': len(aligned), 'referenceLines': len(result[1])})
    lyrics = merge_transcription(aligned, actual)
    versions = [{'label': candidate.get('label', 'Original'), 'isKorean': candidate.get('isKorean', False), 'lyrics': lyrics}]
    # Phonetic text inherits times from its validated parent, never another song.
    for derived in candidates:
        if derived.get('derivedFrom') != candidate.get('id'):
            continue
        derived_lines = derived.get('lines', [])
        converted = []
        for line in aligned:
            idx = line['referenceLine']
            if idx >= len(derived_lines):
                break
            text = derived_lines[idx]['text']
            tokens = text.split()
            start, end = line['words'][0]['start'], line['words'][-1]['end']
            converted.append({'time': start, 'text': text, 'words': [
                {'word': token, 'start': start + (end-start)*i/max(1,len(tokens)),
                 'end': start + (end-start)*(i+1)/max(1,len(tokens))} for i, token in enumerate(tokens)]})
        if len(converted) == len(aligned):
            canonical = [{k: v for k, v in line.items() if k != 'referenceLine'} for line in aligned]
            converted = sorted(converted + [line for line in lyrics if line not in canonical], key=lambda line: line['time'])
            versions.append({'label': derived.get('label', 'Romanized'), 'isKorean': False, 'lyrics': converted})
    return {**base, 'source': aligned_source + ('_multi' if len(versions) > 1 else ''),
            'lyrics': versions if len(versions) > 1 else lyrics}
