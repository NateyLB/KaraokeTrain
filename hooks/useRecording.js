import { useState, useRef, useCallback, useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import useKaraokeStore from '../store/useKaraokeStore';

export function useRecording() {
  const { isRecording, setIsRecording, setToast } = useKaraokeStore(useShallow(state => ({
    isRecording: state.isRecording,
    setIsRecording: state.setIsRecording,
    setToast: state.setToast,
  })));
  const [videoStream, setVideoStream] = useState(null);
  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const cameraRequest = useRef({ generation: 0 });
  const mounted = useRef(false);
  const downloads = useRef(new Map());

  const setVideoEnabled = useCallback(async enabled => {
    const generation = ++cameraRequest.current.generation;
    if (!enabled) {
      streamRef.current?.getTracks().forEach(track => track.stop());
      streamRef.current = null;
      setVideoStream(null);
      return;
    }
    if (streamRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      if (!mounted.current || generation !== cameraRequest.current.generation) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      streamRef.current = stream;
      setVideoStream(stream);
    } catch {
      if (mounted.current && generation === cameraRequest.current.generation) setToast('Could not access webcam for recording.');
    }
  }, [setToast]);

  const startRecording = useCallback(() => {
    if (recorderRef.current?.state === 'recording') return;
    const audioStream = window.__karaokeMediaStreamDest?.stream;
    if (!audioStream?.getAudioTracks().length) return setToast('Play a song to initialize the recording audio.');
    if (!window.MediaRecorder) return setToast('Recording is unavailable in this browser.');
    const videoTracks = streamRef.current?.getVideoTracks() || [];
    const withVideo = videoTracks.length > 0;
    const stream = withVideo ? new MediaStream([...audioStream.getAudioTracks(), ...videoTracks]) : audioStream;
    const types = withVideo ? ['video/webm', 'video/mp4'] : ['audio/webm', 'audio/ogg', 'audio/mp4'];
    const mimeType = types.find(type => MediaRecorder.isTypeSupported(type));
    try {
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const chunks = [];
      recorderRef.current = recorder;
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      recorder.onerror = () => {
        if (recorderRef.current === recorder) { recorderRef.current = null; setIsRecording(false); }
        setToast('Recording failed. Please try again.');
      };
      recorder.onstop = () => {
        if (recorderRef.current === recorder) { recorderRef.current = null; setIsRecording(false); }
        if (!mounted.current || !chunks.length) return;
        const actualType = recorder.mimeType || mimeType || 'audio/webm';
        const blob = new Blob(chunks, { type: actualType });
        const url = URL.createObjectURL(blob);
        const extension = actualType.includes('mp4') ? (withVideo ? 'mp4' : 'm4a') : actualType.includes('ogg') ? 'ogg' : 'webm';
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `karaoke-recording-${new Date().toISOString().replace(/[:.]/g, '-')}.${extension}`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        const timer = setTimeout(() => { URL.revokeObjectURL(url); downloads.current.delete(url); }, 30000);
        downloads.current.set(url, timer);
        setToast('Recording saved!');
      };
      recorder.start(1000);
      setIsRecording(true);
      setToast('Recording started...');
    } catch {
      recorderRef.current = null;
      setIsRecording(false);
      setToast('Failed to start recording.');
    }
  }, [setIsRecording, setToast]);

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
  }, []);

  useEffect(() => {
    mounted.current = true;
    const urls = downloads.current;
    const camera = cameraRequest.current;
    return () => {
      mounted.current = false;
      camera.generation++;
      streamRef.current?.getTracks().forEach(track => track.stop());
      streamRef.current = null;
      const recorder = recorderRef.current;
      if (recorder) {
        recorder.onstop = recorder.onerror = recorder.ondataavailable = null;
        if (recorder.state !== 'inactive') recorder.stop();
        recorderRef.current = null;
      }
      setIsRecording(false);
      for (const [url, timer] of urls) { clearTimeout(timer); URL.revokeObjectURL(url); }
      urls.clear();
    };
  }, [setIsRecording]);

  return { isRecording, isRecordingVideo: Boolean(videoStream), videoStream, setVideoEnabled, startRecording, stopRecording };
}
