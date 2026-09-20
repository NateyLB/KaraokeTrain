const fs = require('fs');

let content = fs.readFileSync('hooks/useAudioAnalyzer.js', 'utf8');

// 1. Update startListening to take echoCancellation
content = content.replace(
  "const startListening = async () => {",
  "const startListening = async (echoCancellation = false) => {"
);
content = content.replace(
  "echoCancellation: false,\n          noiseSuppression: false,\n          autoGainControl: false,",
  "echoCancellation: echoCancellation,\n          noiseSuppression: echoCancellation,\n          autoGainControl: echoCancellation,"
);

// 2. Add setEchoCancellation function
const funcToAdd = `
  const setEchoCancellation = async (echoCancellation) => {
    if (!isListening) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: echoCancellation,
          noiseSuppression: echoCancellation,
          autoGainControl: echoCancellation,
        },
      });
      if (streamRef.current && streamRef.current !== 'pending') {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
      streamRef.current = stream;
      
      if (sourceRef.current) {
        sourceRef.current.disconnect();
      }
      sourceRef.current = audioContextRef.current.createMediaStreamSource(stream);
      sourceRef.current.connect(analyzerRef.current);
      sourceRef.current.connect(gainNodeRef.current);
    } catch (err) {
      console.error("Failed to update echo cancellation stream", err);
    }
  };
`;
content = content.replace(
  "useEffect(() => {\n    isMounted.current = true;",
  funcToAdd + "\n  useEffect(() => {\n    isMounted.current = true;"
);

// 3. Export setEchoCancellation
content = content.replace(
  "return { isListening, volume, pitch, startListening, stopListening, setMicVolume, setEchoEnabled, setVocoderTargetFrequency, error };",
  "return { isListening, volume, pitch, startListening, stopListening, setMicVolume, setEchoEnabled, setVocoderTargetFrequency, setEchoCancellation, error };"
);

// 4. Wrap returning functions in useCallback using memoized refs to avoid dependencies changing
// Wait, actually, the EASIEST way to prevent infinite loops in MicrophonePanel is to just NOT put them in the dependency array!
// I'll update MicrophonePanel.js instead.

fs.writeFileSync('hooks/useAudioAnalyzer.js', content);
