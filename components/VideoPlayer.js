'use client';
import YouTube from 'react-youtube';
import useKaraokeStore from '../store/useKaraokeStore';

export default function VideoPlayer({ videoId, ytPlayerRef, onStateChange }) {
  const { isPlaying, isVideoVisible } = useKaraokeStore();

  return (
    <div className="video-container" style={{ display: isVideoVisible ? 'flex' : 'none' }}>
      <div style={{ position: 'relative', width: '100%', paddingBottom: '56.25%', height: 0, overflow: 'hidden' }}>
        <YouTube 
          videoId={videoId} 
          opts={{
              height: '100%',
              width: '100%',
              playerVars: {
                  autoplay: 0,
                  controls: 0,
                  disablekb: 1,
                  fs: 0,
                  modestbranding: 1,
                  rel: 0
              }
          }}
          iframeClassName="responsive-youtube-iframe"
          style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', borderRadius: '1rem', overflow: 'hidden', border: '1px solid var(--glass-border)', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}
          onReady={(event) => {
              ytPlayerRef.current = event.target;
              event.target.mute();
              if (isPlaying) {
                  event.target.playVideo();
              }
          }}
          onStateChange={onStateChange}
        />
      </div>
    </div>
  );
}
