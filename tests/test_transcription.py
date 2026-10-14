import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'lib' / 'lyrics'))
from transcription import quality, choose_transcript, needs_original_mix


def transcript(probability, count=20):
    segments = [{'avgLogprob': -.4, 'words': [{'probability': probability}] * count}]
    return {'segments': segments, 'quality': quality(segments)}


class TranscriptionTests(unittest.TestCase):
    def test_low_confidence_vocals_trigger_original_mix_comparison(self):
        self.assertTrue(needs_original_mix(transcript(.4)))
        self.assertFalse(needs_original_mix(transcript(.95)))

    def test_clearer_original_can_replace_distorted_vocals(self):
        vocals, original = transcript(.4), transcript(.9)
        self.assertIs(choose_transcript(vocals, original), original)

    def test_confidence_cannot_win_by_omitting_most_lyrics(self):
        vocals, original = transcript(.7), transcript(.99, count=5)
        self.assertIs(choose_transcript(vocals, original), vocals)

    def test_empty_alternative_does_not_erase_existing_transcript(self):
        vocals = transcript(.6)
        empty = {'segments': [], 'quality': quality([])}
        self.assertIs(choose_transcript(vocals, empty), vocals)
        self.assertIs(choose_transcript(empty, vocals), vocals)


if __name__ == '__main__':
    unittest.main()
