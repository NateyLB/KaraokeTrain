import { useState, useRef, useCallback, useEffect } from 'react';
import useKaraokeStore from '../store/useKaraokeStore';

export function useRecording() {
  const { isRecording, setIsRecording, setToast } = useKaraokeStore();
  const [isRecordingVideo, setIsRecordingVideo] = useState(false);
  const [videoStream, setVideoStream] = useState(null);
  
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);

  const enableVideo = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      setVideoStream(stream);
      setIsRecordingVideo(true);
    } catch (e) {
      console.error('Failed to get webcam:', e);
      setToast('Could not access webcam for recording.');
      setIsRecordingVideo(false);
    }
  };

  const disableVideo = () => {
    if (videoStream) {
      videoStream.getTracks().forEach(t => t.stop());
    }
    setVideoStream(null);
    setIsRecordingVideo(false);
  };

  const setVideoEnabled = (enabled) => {
    if (enabled && !isRecordingVideo) {
      enableVideo();
    } else if (!enabled && isRecordingVideo) {
      disableVideo();
    }
  };

  const startRecording = useCallback(() => {
    if (isRecording) return;
    
    // Ensure the audio destination exists
    if (!window.__karaokeMediaStreamDest) {
      setToast('Audio stream not initialized yet.');
      return;
    }

    const audioStream = window.__karaokeMediaStreamDest.stream;
    
    // Check if we have audio tracks
    if (audioStream.getAudioTracks().length === 0) {
      setToast('No audio tracks available to record.');
      return;
    }

    let finalStream = audioStream;

    // Combine video if enabled
    if (isRecordingVideo && videoStream) {
      const videoTracks = videoStream.getVideoTracks();
      if (videoTracks.length > 0) {
        finalStream = new MediaStream([
          ...audioStream.getAudioTracks(),
          ...videoTracks
        ]);
      }
    }

    // Determine mimetype
    let mimeType = 'video/webm'; // Chrome default for video
    if (!isRecordingVideo) {
      // Audio only
      const audioTypes = ['audio/webm', 'audio/ogg'];
      mimeType = audioTypes.find(type => MediaRecorder.isTypeSupported(type)) || '';
    }

    try {
      const recorder = new MediaRecorder(finalStream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType || (isRecordingVideo ? 'video/webm' : 'audio/webm') });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        document.body.appendChild(a);
        a.style = 'display: none';
        a.href = url;
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        a.download = `karaoke-recording-${timestamp}.${isRecordingVideo ? 'webm' : 'webm'}`;
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        setToast('Recording saved!');
      };

      recorder.start(1000); // collect chunks every second
      setIsRecording(true);
      setToast('Recording started...');
    } catch (e) {
      console.error('MediaRecorder start failed:', e);
      setToast('Failed to start recording.');
    }
  }, [isRecording, isRecordingVideo, videoStream, setToast]);

  const stopRecording = useCallback(() => {
    if (!isRecording || !mediaRecorderRef.current) return;
    mediaRecorderRef.current.stop();
    setIsRecording(false);
  }, [isRecording]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (videoStream) {
        videoStream.getTracks().forEach(t => t.stop());
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
    };
  }, [videoStream]);

  return {
    isRecording,
    isRecordingVideo,
    videoStream,
    setVideoEnabled,
    startRecording,
    stopRecording
  };
}
