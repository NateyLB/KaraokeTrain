import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'lib' / 'lyrics'))
from qwen_transcription import timed_words, group_words, restore_punctuation
from lyrics_alignment import align_lyrics


class QwenAdapterTests(unittest.TestCase):
    def test_chunk_offsets_and_invalid_timing(self):
        items = [SimpleNamespace(text='first',start_time=.1,end_time=.4),
                 SimpleNamespace(text='second',start_time=.3,end_time=.6),
                 SimpleNamespace(text='invalid',start_time=float('nan'),end_time=1),
                 SimpleNamespace(text='outside',start_time=3,end_time=4)]
        words=timed_words(items,25,27)
        self.assertEqual([word['word'] for word in words],['first','second'])
        self.assertEqual(words[0]['start'],25.1)
        self.assertEqual(words[1]['start'],25.4)

    def test_instrumental_gap_splits_display_lines(self):
        words=[{'word':'hello','start':0,'end':.5},{'word':'again','start':10,'end':10.5}]
        self.assertEqual(len(group_words(words)),2)

    def test_zero_width_function_words_are_preserved(self):
        items = [SimpleNamespace(text=word,start_time=start,end_time=end) for word,start,end in
                 [('tired',0,.5),('of',.5,.5),('your',.5,.7),('ways',.7,1)]]
        words = timed_words(items,0,1)
        self.assertEqual([word['word'] for word in words],['tired','of','your','ways'])
        self.assertTrue(all(word['end']>word['start'] for word in words))
        self.assertTrue(all(words[i]['end']<=words[i+1]['start'] for i in range(len(words)-1)))
        self.assertEqual(restore_punctuation(words,'Tired of your ways.')[0]['word'],'Tired')
        self.assertEqual(restore_punctuation(words,'Tired of your ways.')[-1]['word'],'ways.')

    def test_long_phrases_are_bounded_and_no_words_lost(self):
        words=[{'word':str(i),'start':i*.4,'end':i*.4+.3} for i in range(25)]
        lines=group_words(words)
        self.assertTrue(all(len(line['words'])<=10 for line in lines))
        self.assertEqual(sum(len(line['words']) for line in lines),25)

    def test_qwen_fallback_has_honest_provider_label(self):
        transcript={'provider':'qwen','duration':20,'segments':[
            {'text':'actual performance','words':[{'word':'actual','start':2,'end':3},{'word':'performance','start':3,'end':4}]}]}
        result=align_lyrics([],transcript)
        self.assertEqual(result['source'],'qwen_transcription')
        self.assertEqual(result['lyrics'][0]['time'],2)


if __name__=='__main__':
    unittest.main()
