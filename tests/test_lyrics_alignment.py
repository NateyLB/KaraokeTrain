import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'lib' / 'lyrics'))
from lyrics_alignment import align_lyrics, fallback, verify_cached_timing
import copy

LINES = ['Copper skies above the river', 'Carry every lantern safely home', 'Morning opens windows for the travelers', 'We will meet beside the stone']

def candidate(lines=LINES, **extra):
    return {'id':1, 'exactMatch':True, 'lines':[{'text':text,'time':151+i*5} for i,text in enumerate(lines)], **extra}

def transcript(lines=LINES, starts=None):
    starts = starts or [25,40,75,94]
    segments=[]
    for text,start in zip(lines, starts):
        words=[{'word':word,'start':start+i*.5,'end':start+i*.5+.4} for i,word in enumerate(text.split())]
        segments.append({'text':text,'start':start,'end':words[-1]['end'],'words':words})
    return {'duration':1000,'segments':segments}

class AlignmentTests(unittest.TestCase):
    def test_cached_timing_is_verified_against_qwen_without_rewriting_text(self):
        data = {**transcript(), 'provider': 'qwen', 'independent': True}
        saved = fallback(data)
        self.assertTrue(verify_cached_timing(saved, data)['aligned'])
        cached = {**candidate(cached=True), 'lines': saved}
        result = align_lyrics([cached], data)
        self.assertTrue(result['cacheTiming']['aligned'])

    def test_cached_drift_missing_intervals_and_text_mismatch_are_not_verified(self):
        data = {**transcript(), 'provider': 'qwen', 'independent': True}
        saved = fallback(data)
        shifted = copy.deepcopy(saved)
        for line in shifted:
            for word in line['words']:
                word['start'] += 4
                word['end'] += 4
        self.assertFalse(verify_cached_timing(shifted, data)['aligned'])
        self.assertEqual(verify_cached_timing(shifted, data)['medianStartError'], 4)
        saved[0]['words'] = None
        self.assertFalse(verify_cached_timing(saved, data)['aligned'])
        other = {**data, 'segments': transcript(['Unrelated words fly nowhere'] * 4)['segments']}
        self.assertFalse(verify_cached_timing(fallback(data), other)['aligned'])

    def test_mismatch_with_studio_times_must_fall_back(self):
        result=align_lyrics([candidate()],transcript(['Apple engines orbit the moon','Purple bridges turn upside down','A silent radio follows clouds','People dance under emerald mountains']))
        self.assertEqual(result['source'],'whisper_fallback')
        self.assertFalse(result['validation']['candidates'][0]['accepted'])
        self.assertEqual(result['lyrics'][0]['time'],25)

    def test_live_timing_uses_performance_not_global_offset(self):
        result=align_lyrics([candidate()],transcript())
        self.assertEqual(result['source'],'lrclib_aligned')
        self.assertEqual([line['time'] for line in result['lyrics']],[25,40,75,94])
        self.assertTrue(all(w['start']<w['end'] for l in result['lyrics'] for w in l['words']))

    def test_repeated_choruses_over_200_words(self):
        lines=LINES*15
        result=align_lyrics([candidate(lines)],transcript(lines,[i*6 for i in range(len(lines))]))
        self.assertEqual(result['validation']['selected']['score'],1)
        self.assertEqual(len(result['lyrics']),len(lines))

    def test_empty_or_common_word_only_transcript_is_not_validation(self):
        self.assertEqual(align_lyrics([candidate()],{'segments':[]})['lyrics'],[])
        result=align_lyrics([candidate(['the the the the the the the the'])],transcript(['the the the the the the the the'],[20]))
        self.assertEqual(result['source'],'whisper_fallback')

    def test_unperformed_verse_is_omitted(self):
        extra='Lonely satellites circle another planet'
        result=align_lyrics([candidate(LINES[:2]+[extra]+LINES[2:])],transcript())
        self.assertEqual(result['source'],'lrclib_aligned')
        self.assertNotIn(extra,[line['text'] for line in result['lyrics']])

    def test_live_extra_verse_is_preserved(self):
        extra='Fireflies welcome every weary sailor'
        result=align_lyrics([candidate()],transcript(LINES[:2]+[extra]+LINES[2:],[25,40,60,75,94]))
        self.assertEqual(result['source'],'lrclib_aligned')
        self.assertIn(extra,[line['text'] for line in result['lyrics']])

    def test_caller_cannot_bypass_exact_identity(self):
        self.assertEqual(align_lyrics([candidate(exactMatch=False)],transcript())['source'],'whisper_fallback')

    def test_invalid_word_intervals_are_not_displayed(self):
        data=transcript()
        data['segments'][0]['words'][0]['start']=-1
        data['segments'][0]['words'][1]['end']=float('nan')
        result=align_lyrics([],data)
        self.assertTrue(all(w['start']>=0 and w['end']<=1000 for l in result['lyrics'] for w in l['words']))

    def test_synthesized_version_inherits_only_validated_parent(self):
        derived=candidate(['one two three four five']*4,id='1_phonetic',derivedFrom=1,label='Romanized')
        result=align_lyrics([candidate(),derived],transcript())
        self.assertEqual(result['source'],'lrclib_aligned_multi')
        self.assertEqual([l['time'] for l in result['lyrics'][0]['lyrics']],[l['time'] for l in result['lyrics'][1]['lyrics']])
        rejected=align_lyrics([candidate(exactMatch=False),derived],transcript())
        self.assertEqual(rejected['source'],'whisper_fallback')

if __name__=='__main__':
    unittest.main()
