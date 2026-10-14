import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'lib'/'lyrics'))
from timing_refinement import refine_timing, extend_sustained_words

class TimingTests(unittest.TestCase):
    def test_corrects_collapsed_word_without_changing_transcription(self):
        tokens=['Copper','lanterns','shine','across','quiet','rivers','guiding','travelers','home']
        words=[{'word':token,'start':i,'end':i+.02} for i,token in enumerate(tokens)]
        original={'duration':15,'segments':[{'text':' '.join(tokens),'words':words}]}
        reference={'segments':[{'words':[{**word,'end':word['start']+.7,'probability':.95} for word in words]}]}
        result=refine_timing(original,reference)
        self.assertEqual([w['word'] for s in result['segments'] for w in s['words']],tokens)
        self.assertEqual(result['timingValidation']['collapsedAfter'],0)
        self.assertEqual(original['segments'][0]['words'][0]['end'],.02)

    def test_another_chorus_cannot_supply_distant_timing(self):
        words=[{'word':f'word{i}','start':i,'end':i+.2} for i in range(10)]
        original={'duration':50,'segments':[{'text':'words','words':words}]}
        reference={'segments':[{'words':[{**w,'start':w['start']+20,'end':w['end']+20,'probability':.99} for w in words]}]}
        result=refine_timing(original,reference)
        self.assertFalse(result['timingValidation']['accepted'])
        self.assertEqual(result['segments'],original['segments'])

    def test_vocal_sustain_extends_until_silence_without_crossing_next_word(self):
        import numpy as np
        audio=np.zeros(4000,dtype=np.float32)
        audio[:1800]=.2
        audio[3000:3500]=.2
        words=[{'word':'held','start':0,'end':1},{'word':'next','start':3,'end':3.5}]
        extend_sustained_words(words,audio,1000)
        self.assertAlmostEqual(words[0]['end'],1.8,delta=.03)
        self.assertLess(words[0]['end'],words[1]['start'])

    def test_untrusted_word_does_not_move_into_the_next_verse(self):
        tokens=['Copper','lanterns','shine','across','quiet','rivers','guiding','travelers','home']
        words=[{'word':token,'start':i,'end':i+.4} for i,token in enumerate(tokens)]
        words[4].update(start=5.8,end=5.82)
        original={'duration':20,'segments':[{'text':' '.join(tokens),'words':words}]}
        ref_words=[{**word,'probability':.95} for idx,word in enumerate(words) if idx!=4]
        result=refine_timing(original,{'segments':[{'words':ref_words}]})
        timed=[w for s in result['segments'] for w in s['words']]
        self.assertEqual([w['word'] for w in timed],tokens)
        self.assertTrue(all(timed[idx]['end']<=timed[idx+1]['start'] for idx in range(len(timed)-1)))

if __name__=='__main__':unittest.main()
