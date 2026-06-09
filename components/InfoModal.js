'use client';
import { HelpCircle, X, Mic, Music, Volume2, FastForward, Play, Pause, Search, Clock, Circle, Smartphone } from 'lucide-react';
import useKaraokeStore from '../store/useKaraokeStore';

export default function InfoModal({ context = 'room' }) {
  const { isInfoOpen, setIsInfoOpen } = useKaraokeStore();

  if (!isInfoOpen) return null;

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0, 0, 0, 0.7)', backdropFilter: 'blur(10px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 100, padding: '2rem'
    }}>
      <div className="glass-panel animate-fade-in" style={{
        maxWidth: '600px', width: '100%', maxHeight: '80vh', overflowY: 'auto',
        padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem',
        position: 'relative', border: '1px solid var(--glass-border)',
        boxShadow: '0 1rem 3rem rgba(0,0,0,0.5)'
      }}>
        
        <button 
          onClick={() => setIsInfoOpen(false)}
          style={{
            position: 'absolute', top: '1.5rem', right: '1.5rem',
            background: 'var(--glass-bg)', border: 'none', color: 'white',
            borderRadius: '50%', width: '2rem', height: '2rem',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer'
          }}
        >
          <X size={18} />
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
          <HelpCircle size={28} color="var(--primary-accent)" />
          <h2 className="heading-2" style={{ margin: 0 }}>
            {context === 'home' ? 'Welcome to KaraokeTrain' : 
             context === 'remote' ? 'Remote Queue Guide' : 
             context === 'room-empty' ? 'Searching & Queuing' :
             'How to use KaraokeTrain'}
          </h2>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          {context === 'home' && (
            <>
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                <div style={{ background: 'rgba(255,255,255,0.1)', padding: '0.75rem', borderRadius: '50%' }}>
                  <Play size={20} color="#60a5fa" />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.1rem', marginBottom: '0.25rem', fontWeight: 600 }}>Host a Party</h3>
                  <p className="body-text" style={{ fontSize: '0.9rem', lineHeight: 1.5, opacity: 0.9 }}>
                    Click "Host a Party" to start a new karaoke room on this display. This screen will show the lyrics and video for everyone to sing along to.
                  </p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                <div style={{ background: 'rgba(255,255,255,0.1)', padding: '0.75rem', borderRadius: '50%' }}>
                  <Music size={20} color="#f472b6" />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.1rem', marginBottom: '0.25rem', fontWeight: 600 }}>Join a Party</h3>
                  <p className="body-text" style={{ fontSize: '0.9rem', lineHeight: 1.5, opacity: 0.9 }}>
                    If your friend is already hosting a room on their TV or monitor, enter the 4-letter room code to join the party on your phone! You'll be able to search and queue songs remotely.
                  </p>
                </div>
              </div>
            </>
          )}

          {context === 'remote' && (
            <>
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                <div style={{ background: 'rgba(255,255,255,0.1)', padding: '0.75rem', borderRadius: '50%' }}>
                  <Search size={20} color="#60a5fa" />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.1rem', marginBottom: '0.25rem', fontWeight: 600 }}>Searching & Smart DJ</h3>
                  <p className="body-text" style={{ fontSize: '0.9rem', lineHeight: 1.5, opacity: 0.9 }}>
                    Use the search bar to find any song on YouTube. If you ask a question or request a vibe (e.g. "play some upbeat 80s pop"), the AI DJ will recommend songs! The DJ can also recommend songs based on what has already been played, just ask it to.
                  </p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                <div style={{ background: 'rgba(255,255,255,0.1)', padding: '0.75rem', borderRadius: '50%' }}>
                  <FastForward size={20} color="#f472b6" />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.1rem', marginBottom: '0.25rem', fontWeight: 600 }}>Queue Management</h3>
                  <p className="body-text" style={{ fontSize: '0.9rem', lineHeight: 1.5, opacity: 0.9 }}>
                    Scroll down to view the "Up Next" queue. You can use the up/down arrows to reorder songs, delete songs, or hit "Play Now" to force a song to play immediately on the main display.
                  </p>
                </div>
              </div>
            </>
          )}

          {context === 'room-empty' && (
            <>
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                <div style={{ background: 'rgba(255,255,255,0.1)', padding: '0.75rem', borderRadius: '50%' }}>
                  <Search size={20} color="#60a5fa" />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.1rem', marginBottom: '0.25rem', fontWeight: 600 }}>Searching & Smart DJ</h3>
                  <p className="body-text" style={{ fontSize: '0.9rem', lineHeight: 1.5, opacity: 0.9 }}>
                    Use the search bar to find any song on YouTube. If you ask a question or request a vibe (e.g. "play some upbeat 80s pop"), the AI DJ will recommend songs! The DJ can also recommend songs based on what has already been played, just ask it to.
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                <div style={{ background: 'rgba(255,255,255,0.1)', padding: '0.75rem', borderRadius: '50%' }}>
                  <Music size={20} color="#ec4899" />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.1rem', marginBottom: '0.25rem', fontWeight: 600 }}>Song Queue</h3>
                  <p className="body-text" style={{ fontSize: '0.9rem', lineHeight: 1.5, opacity: 0.9 }}>
                    Click the Music note button at the top to view and manage the upcoming song queue. You can reorder songs, skip to a specific song, or remove them entirely.
                  </p>
                </div>
              </div>
            </>
          )}

          {context === 'room' && (
            <>
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                <div style={{ background: 'rgba(255,255,255,0.1)', padding: '0.75rem', borderRadius: '50%' }}>
                  <Search size={20} color="#60a5fa" />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.1rem', marginBottom: '0.25rem', fontWeight: 600 }}>Searching & Smart DJ</h3>
                  <p className="body-text" style={{ fontSize: '0.9rem', lineHeight: 1.5, opacity: 0.9 }}>
                    Use the search bar to find any song on YouTube. If you ask a question or request a vibe (e.g. "play some upbeat 80s pop"), the AI DJ will recommend songs! The DJ can also recommend songs based on what has already been played, just ask it to.
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                <div style={{ background: 'rgba(255,255,255,0.1)', padding: '0.75rem', borderRadius: '50%' }}>
                  <Volume2 size={20} color="#f472b6" />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.1rem', marginBottom: '0.25rem', fontWeight: 600 }}>Vocals Toggle</h3>
                  <p className="body-text" style={{ fontSize: '0.9rem', lineHeight: 1.5, opacity: 0.9 }}>
                    Toggle the vocals button in the player controls to switch between the full original song and the instrumental karaoke version in real-time.
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                <div style={{ background: 'rgba(255,255,255,0.1)', padding: '0.75rem', borderRadius: '50%' }}>
                  <Clock size={20} color="#fbbf24" />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.1rem', marginBottom: '0.25rem', fontWeight: 600 }}>Lyrics Alignment</h3>
                  <p className="body-text" style={{ fontSize: '0.9rem', lineHeight: 1.5, opacity: 0.9 }}>
                    If the lyrics are slightly out of sync with the music, use the <code>+</code> and <code>-</code> buttons in the player controls. Pressing <code>-</code> will "speed up" the lyrics (make them appear sooner), and vice versa.
                    <br /><br />
                    If they are <strong>totally</strong> out of sync, press "Align Start" at the exact moment the singer sings the very first lyric in the song, or manually type the starting timestamp into the input box.
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                <div style={{ background: 'rgba(255,255,255,0.1)', padding: '0.75rem', borderRadius: '50%' }}>
                  <Mic size={20} color="#ec4899" />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.1rem', marginBottom: '0.25rem', fontWeight: 600 }}>Microphone Panel</h3>
                  <p className="body-text" style={{ fontSize: '0.9rem', lineHeight: 1.5, opacity: 0.9 }}>
                    Click the Mic button at the top to open the microphone panel. You can adjust your mic volume, add Echo, use AutoTune pitch correction, or use the <strong>Voc</strong> slider to adjust the volume of the original singer's vocals! Note: Use headphones to prevent feedback!
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                <div style={{ background: 'rgba(255,255,255,0.1)', padding: '0.75rem', borderRadius: '50%' }}>
                  <Circle size={20} color="#ef4444" />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.1rem', marginBottom: '0.25rem', fontWeight: 600 }}>Recording Panel</h3>
                  <p className="body-text" style={{ fontSize: '0.9rem', lineHeight: 1.5, opacity: 0.9 }}>
                    Click the red circle button to open the recording panel. You can start a recording to perfectly capture your singing along with the instrumental track! If you click <strong>Enable Webcam</strong>, it will record a video of you singing too!
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                <div style={{ background: 'rgba(255,255,255,0.1)', padding: '0.75rem', borderRadius: '50%' }}>
                  <Music size={20} color="#ec4899" />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.1rem', marginBottom: '0.25rem', fontWeight: 600 }}>Song Queue</h3>
                  <p className="body-text" style={{ fontSize: '0.9rem', lineHeight: 1.5, opacity: 0.9 }}>
                    Click the Music note button at the top to view and manage the upcoming song queue. You can reorder songs, skip to a specific song, or remove them entirely.
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                <div style={{ background: 'rgba(255,255,255,0.1)', padding: '0.75rem', borderRadius: '50%' }}>
                  <Smartphone size={20} color="#f59e0b" />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.1rem', marginBottom: '0.25rem', fontWeight: 600 }}>Remote Control</h3>
                  <p className="body-text" style={{ fontSize: '0.9rem', lineHeight: 1.5, opacity: 0.9 }}>
                    Friends can join the room on their phones using the room code! The mobile remote lets them queue songs, adjust playback, control the microphone effects, and sync the lyrics from anywhere in the room.
                  </p>
                </div>
              </div>
            </>
          )}

        </div>
      </div>
    </div>
  );
}
