import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'lib' / 'lyrics'))
from sequence_alignment import monotonic_matches


class SequenceTests(unittest.TestCase):
    def test_repeated_sections_find_all_monotonic_evidence(self):
        reference = 'river lantern river copper river copper home copper home home copper home lantern lantern river river home river home lantern river river home home'.split()
        actual = 'lantern river copper copper copper home home lantern lantern traveler traveler river lantern river home home'.split()
        pairs = monotonic_matches(reference, actual)
        self.assertEqual(len(pairs), 14)
        self.assertTrue(all(reference[i] == actual[j] for i, j in pairs))
        self.assertTrue(all(a[0] < b[0] and a[1] < b[1] for a, b in zip(pairs, pairs[1:])))

    def test_weights_reject_distant_matches_and_break_repetition_ties(self):
        self.assertEqual(monotonic_matches(['echo'], ['echo'], lambda i, j: None), [])
        self.assertEqual(monotonic_matches(['echo'], ['echo', 'echo'], lambda i, j: 1 + j * .1), [(0, 1)])
        self.assertEqual(monotonic_matches([], ['echo']), [])


if __name__ == '__main__':
    unittest.main()
