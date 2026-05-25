import { useState, useEffect, useRef } from 'react';

/**
 * Pitch-stability based grading system.
 *
 * Since we don't yet have reference MIDI data per song, we score:
 *  - Whether the user is singing during active lyric lines (timing)
 *  - Whether their pitch is stable and sustained (pitch quality)
 *  - Combo multiplier for consecutive good frames
 *
 * When reference MIDI data is integrated (e.g. UltraStar format),
 * the `referenceMidi` parameter can be passed in for true note matching.
 */
export function useGrading(lyrics, currentSongTime, userVolume, userPitch, guideNotes) {
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [pitchQuality, setPitchQuality] = useState(0); // 0–100

  const lastScoredTimeRef = useRef(0);
  const recentPitchRef = useRef([]); // rolling window of midi values
  const feedbackTimeoutRef = useRef(null);

  useEffect(() => {
    if (!lyrics || lyrics.length === 0) return;

    const now = currentSongTime;

    // Throttle scoring to every 200ms
    if (now - lastScoredTimeRef.current < 0.2) return;
    lastScoredTimeRef.current = now;

    const isSinging = userVolume > 12;
    const hasPitch = userPitch && userPitch.midi;
    const activeGuideNote = guideNotes?.find(n => now >= n.startTime && now <= n.endTime);

    // Track pitch stability in a rolling window
    if (hasPitch && isSinging) {
      recentPitchRef.current.push(userPitch.midi);
      if (recentPitchRef.current.length > 6) recentPitchRef.current.shift();
    } else {
      recentPitchRef.current = [];
    }

    // Calculate pitch stability
    let stability = 0;
    if (recentPitchRef.current.length >= 2) {
      const pitches = recentPitchRef.current;
      const mean = pitches.reduce((a, b) => a + b, 0) / pitches.length;
      const variance = pitches.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / pitches.length;
      stability = Math.max(0, Math.min(100, 100 - (variance / 4) * 100));
    }
    setPitchQuality(stability);

    if (activeGuideNote) {
      if (isSinging && hasPitch) {
        const pitchDiff = Math.abs(userPitch.midi - activeGuideNote.midi);
        // Off by 4 semitones = 0%, perfect match = 100%
        const pitchAccuracy = Math.max(0, 100 - (pitchDiff * 25));

        if (pitchAccuracy >= 50 && stability >= 50) {
          // Singing close to the target note and stable
          const points = Math.round(30 + pitchAccuracy * 0.5 + stability * 0.2 + combo * 3);
          setScore(prev => prev + points);
          setCombo(prev => prev + 1);

          if (pitchAccuracy >= 90) {
            showFeedback('Perfect! ✨');
          } else if (pitchAccuracy >= 70) {
            showFeedback('Great! 🎤');
          }
        } else {
          // Singing but off pitch or wobbly
          setScore(prev => prev + 8);
          setCombo(prev => Math.max(0, prev - 1));
          showFeedback('Steady...');
        }
      } else if (!isSinging) {
        // Not singing during an active guide note — break combo
        if (combo > 2) showFeedback('Miss! 😬');
        setCombo(0);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSongTime]);

  const showFeedback = (text) => {
    setFeedback(text);
    clearTimeout(feedbackTimeoutRef.current);
    feedbackTimeoutRef.current = setTimeout(() => setFeedback(''), 900);
  };

  const resetScore = () => {
    setScore(0);
    setCombo(0);
    setFeedback('');
    setPitchQuality(0);
    recentPitchRef.current = [];
    lastScoredTimeRef.current = 0;
    currentLineIndexRef.current = -1;
  };

  return { score, combo, feedback, pitchQuality, resetScore };
}
