import { useState, useEffect, useRef } from 'react';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/**
 * Autocorrelation-based pitch detection.
 * Returns the dominant frequency (Hz) and RMS volume.
 */
function detectPitch(float32Buffer, sampleRate) {
  const SIZE = float32Buffer.length;
  const MAX_SAMPLES = Math.floor(SIZE / 2);

  // RMS for volume measurement
  let rms = 0;
  for (let i = 0; i < SIZE; i++) {
    rms += float32Buffer[i] * float32Buffer[i];
  }
  rms = Math.sqrt(rms / SIZE);

  // Silence threshold — not enough signal to detect pitch
  if (rms < 0.025) return { frequency: -1, rms };

  // Autocorrelation
  let bestOffset = -1;
  let bestCorrelation = 0;
  let lastCorrelation = 1;
  let foundGoodCorrelation = false;

  for (let offset = 1; offset < MAX_SAMPLES; offset++) {
    let correlation = 0;
    for (let i = 0; i < MAX_SAMPLES; i++) {
      correlation += Math.abs(float32Buffer[i] - float32Buffer[i + offset]);
    }
    correlation = 1 - correlation / MAX_SAMPLES;

    if (correlation > 0.9 && correlation > lastCorrelation) {
      foundGoodCorrelation = true;
      if (correlation > bestCorrelation) {
        bestCorrelation = correlation;
        bestOffset = offset;
      }
    } else if (foundGoodCorrelation) {
      // Parabolic interpolation for sub-sample accuracy
      const x1 = bestOffset - 1;
      const x2 = bestOffset;
      const x3 = bestOffset + 1;
      const shift =
        x1 < 0 || x3 >= MAX_SAMPLES
          ? 0
          : (float32Buffer[x3] - float32Buffer[x1]) /
            (2 * (2 * float32Buffer[x2] - float32Buffer[x1] - float32Buffer[x3]));
      return { frequency: sampleRate / (bestOffset + shift), rms };
    }
    lastCorrelation = correlation;
  }

  if (bestCorrelation > 0.01 && bestOffset > 0) {
    return { frequency: sampleRate / bestOffset, rms };
  }

  return { frequency: -1, rms };
}

/**
 * Converts a frequency (Hz) to a musical note with octave and cents offset.
 */
export function frequencyToNote(freq) {
  if (!freq || freq <= 0) return null;
  const noteNum = 12 * Math.log2(freq / 440) + 69; // MIDI note number
  const rounded = Math.round(noteNum);
  const cents = Math.round((noteNum - rounded) * 100); // -50 to +50
  const noteName = NOTE_NAMES[((rounded % 12) + 12) % 12];
  const octave = Math.floor(rounded / 12) - 1;
  return {
    name: `${noteName}${octave}`,
    noteName,
    octave,
    midi: rounded,
    cents, // negative = flat, positive = sharp
    frequency: freq,
  };
}

export function useAudioAnalyzer() {
  const [isListening, setIsListening] = useState(false);
  const [volume, setVolume] = useState(0);
  const [pitch, setPitch] = useState(null); // { name, noteName, octave, midi, cents, frequency }
  const [error, setError] = useState(null);

  const audioContextRef = useRef(null);
  const analyzerRef = useRef(null);
  const sourceRef = useRef(null);
  const gainNodeRef = useRef(null);
  const delayNodeRef = useRef(null);
  const vocoderOscRef = useRef(null);
  const vocoderGainRef = useRef(null);
  const animationFrameRef = useRef(null);
  // Smooth pitch with a small history buffer to reduce jitter
  const pitchHistoryRef = useRef([]);

  const startListening = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: false,  // keep false — noise suppression can distort pitch
          autoGainControl: false,   // keep false — prevents mic level from jumping
        },
      });

      const AudioContext = window.AudioContext || window.webkitAudioContext;
      audioContextRef.current = new AudioContext();
      analyzerRef.current = audioContextRef.current.createAnalyser();
      analyzerRef.current.fftSize = 2048;
      analyzerRef.current.smoothingTimeConstant = 0;

      const masterMix = audioContextRef.current.createGain();
      masterMix.connect(audioContextRef.current.destination);

      gainNodeRef.current = audioContextRef.current.createGain();
      gainNodeRef.current.gain.value = 0.8; // Default to 80% volume

      sourceRef.current = audioContextRef.current.createMediaStreamSource(stream);
      
      // Connect source to analyzer for pitch detection
      sourceRef.current.connect(analyzerRef.current);
      
      // Clean vocal to mix
      sourceRef.current.connect(gainNodeRef.current);
      gainNodeRef.current.connect(masterMix);

      // --- ECHO EFFECT ---
      delayNodeRef.current = audioContextRef.current.createDelay(1.0);
      delayNodeRef.current.delayTime.value = 0; // 0 means Off
      const feedbackGain = audioContextRef.current.createGain();
      feedbackGain.gain.value = 0.4; // 40% echo feedback
      
      gainNodeRef.current.connect(delayNodeRef.current);
      delayNodeRef.current.connect(feedbackGain);
      feedbackGain.connect(delayNodeRef.current);
      delayNodeRef.current.connect(masterMix);

      // --- ROBOT VOCODER EFFECT ---
      vocoderOscRef.current = audioContextRef.current.createOscillator();
      vocoderOscRef.current.type = 'sawtooth';
      vocoderOscRef.current.frequency.value = 0; // 0 means Off
      vocoderOscRef.current.start();
      
      // Lowpass filter to make the sawtooth sound more like a voice
      const vocoderFilter = audioContextRef.current.createBiquadFilter();
      vocoderFilter.type = 'lowpass';
      vocoderFilter.frequency.value = 1500;
      vocoderOscRef.current.connect(vocoderFilter);
      
      vocoderGainRef.current = audioContextRef.current.createGain();
      vocoderGainRef.current.gain.value = 0;
      vocoderFilter.connect(vocoderGainRef.current);
      vocoderGainRef.current.connect(masterMix);

      setIsListening(true);
      setError(null);
      pitchHistoryRef.current = [];
      analyzeAudio();
    } catch (err) {
      setError('Microphone access denied. Please allow it in your browser settings.');
    }
  };

  const stopListening = () => {
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    if (sourceRef.current) {
      sourceRef.current.mediaStream.getTracks().forEach(t => t.stop());
      sourceRef.current.disconnect();
    }
    if (vocoderOscRef.current) {
      try { vocoderOscRef.current.stop(); } catch(e){}
    }
    if (audioContextRef.current) audioContextRef.current.close();
    setIsListening(false);
    setVolume(0);
    setPitch(null);
  };

  const analyzeAudio = () => {
    if (!analyzerRef.current || !audioContextRef.current) return;

    const bufferLength = analyzerRef.current.fftSize;
    const float32Array = new Float32Array(bufferLength);
    analyzerRef.current.getFloatTimeDomainData(float32Array);

    const { frequency, rms } = detectPitch(
      float32Array,
      audioContextRef.current.sampleRate
    );

    // Normalize to 0–100
    const vol = Math.min(100, Math.max(0, rms * 350));
    setVolume(vol);

    // Update Vocoder Envelope (T-Pain effect)
    if (vocoderGainRef.current && vocoderOscRef.current && vocoderOscRef.current.frequency.value > 0) {
      // Map vocal mic volume to synth volume instantly
      const targetGain = (vol / 100) * 0.4; // 40% mix for the synth
      vocoderGainRef.current.gain.setTargetAtTime(targetGain, audioContextRef.current.currentTime, 0.02);
    } else if (vocoderGainRef.current) {
      vocoderGainRef.current.gain.value = 0;
    }

    // Only trust pitches in the human singing range (roughly C2–C7)
    if (frequency > 60 && frequency < 1500) {
      const note = frequencyToNote(frequency);

      // Smooth: keep a rolling buffer of last 5 midi values, use median
      pitchHistoryRef.current.push(note.midi);
      if (pitchHistoryRef.current.length > 5) pitchHistoryRef.current.shift();
      const sorted = [...pitchHistoryRef.current].sort((a, b) => a - b);
      const medianMidi = sorted[Math.floor(sorted.length / 2)];

      if (medianMidi === note.midi) {
        setPitch(note);
      }
      // else: outlier — skip this frame
    } else {
      pitchHistoryRef.current = [];
      setPitch(null);
    }

    animationFrameRef.current = requestAnimationFrame(analyzeAudio);
  };

  const setMicVolume = (level) => {
    if (gainNodeRef.current) {
      // level should be between 0.0 and 5.0
      gainNodeRef.current.gain.value = level;
    }
  };

  const setEchoEnabled = (enabled) => {
    if (delayNodeRef.current) {
      // 0.3 seconds of delay for a classic karaoke echo
      delayNodeRef.current.delayTime.value = enabled ? 0.3 : 0;
    }
  };
  
  const setVocoderTargetFrequency = (freq) => {
    if (vocoderOscRef.current && audioContextRef.current) {
      if (freq > 0) {
        vocoderOscRef.current.frequency.setTargetAtTime(freq, audioContextRef.current.currentTime, 0.05);
      } else {
        vocoderOscRef.current.frequency.value = 0;
      }
    }
  };

  useEffect(() => () => stopListening(), []);

  return { isListening, volume, pitch, startListening, stopListening, setMicVolume, setEchoEnabled, setVocoderTargetFrequency, error };
}
