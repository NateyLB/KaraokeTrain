import { useState, useEffect, useRef, useCallback } from 'react';
import { MicrophoneEngine } from '../lib/audio/MicrophoneEngine';

export function useAudioAnalyzer() {
  const [state, setState] = useState({ isListening: false, volume: 0, pitch: null, error: null });
  const engine = useRef(null);

  useEffect(() => {
    const microphone = new MicrophoneEngine({ onChange: update => setState(previous => ({ ...previous, ...update })) });
    engine.current = microphone;
    return () => { microphone.dispose(); engine.current = null; };
  }, []);

  const startListening = useCallback(echoCancellation => engine.current?.start(echoCancellation), []);
  const stopListening = useCallback(() => engine.current?.stop(), []);
  const setMicVolume = useCallback(level => engine.current?.setVolume(level), []);
  const setEchoEnabled = useCallback(enabled => engine.current?.setEcho(enabled), []);
  const setVocoderTargetFrequency = useCallback(frequency => engine.current?.setFrequency(frequency), []);
  const setEchoCancellation = useCallback(enabled => engine.current?.setEchoCancellation(enabled), []);
  return { ...state, startListening, stopListening, setMicVolume, setEchoEnabled, setVocoderTargetFrequency, setEchoCancellation };
}
