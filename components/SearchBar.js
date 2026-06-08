"use client";

import { useState, useRef, useEffect } from 'react';
import { Search, Music2, ChevronRight, Music, Sparkles, Mic } from 'lucide-react';
import useKaraokeStore from '../store/useKaraokeStore';

export default function SearchBar({ onSelect }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [isAskingDJ, setIsAskingDJ] = useState(false);
  const [djResponse, setDjResponse] = useState(null);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef(null);
  const textareaRef = useRef(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 150)}px`;
    }
  }, [query]);

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      alert('Voice search is not supported in this browser. Try Chrome or Safari.');
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onstart = () => {
      setIsListening(true);
      setQuery('');
    };

    recognition.onresult = (event) => {
      let transcript = '';
      for (let i = 0; i < event.results.length; ++i) {
        transcript += event.results[i][0].transcript;
      }
      setQuery(transcript);
    };

    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    try {
      recognition.start();
    } catch (e) {
      console.error('Failed to start speech recognition:', e);
      setIsListening(false);
    }
  };

  const askDJ = async (promptText) => {
    if (isAskingDJ) return;
    
    setIsAskingDJ(true);
    setDjResponse(null);
    setHasSearched(true);
    setResults([]);
    
    try {
      const state = useKaraokeStore.getState();
      const res = await fetch('/api/dj', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: promptText,
          history: state.partyHistory || [],
          currentSong: state.currentSong,
          queue: state.queue || []
        })
      });
      const data = await res.json();
      if (!data.error) {
        setDjResponse(data);
      } else {
        console.error("DJ error:", data.error);
      }
    } catch (err) {
      console.error('Ask DJ failed:', err);
    } finally {
      setIsAskingDJ(false);
    }
  };

  const handleSearch = async (e, overrideQuery = null, forceYoutube = false) => {
    e?.preventDefault?.();
    const activeQuery = overrideQuery !== null ? overrideQuery : query;
    if (!activeQuery.trim()) return;

    if (!forceYoutube) {
      // Smart Routing Heuristic:
      // Route to DJ if it starts with a question/request word, contains a question mark, or is a long sentence.
      const isQuestionWord = /^(what|can|should|could|would|recommend|suggest|how|give|some|play|any|good|who|need)\b/i.test(activeQuery.trim());
      const hasQuestionMark = activeQuery.includes('?');
      const isConversational = activeQuery.trim().split(/\s+/).length >= 6;

      if (isQuestionWord || hasQuestionMark || isConversational) {
        return askDJ(activeQuery);
      }
    }

    // Otherwise route to YouTube search
    setIsSearching(true);
    setHasSearched(true);
    setDjResponse(null);

    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(activeQuery)}`);
      const data = await res.json();
      setResults(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Search failed:', err);
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem', minHeight: 0 }}>
      <form onSubmit={(e) => handleSearch(e)} style={{ position: 'relative' }}>
        <div style={{ position: 'relative' }}>
          <Search
            size={20}
            color="var(--text-muted)"
            style={{ position: 'absolute', left: '1rem', top: '1.1rem', pointerEvents: 'none' }}
          />
          <textarea
            ref={textareaRef}
            className="input-field"
            placeholder="Search YouTube or Ask the DJ..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSearch(e);
              }
            }}
            rows={1}
            style={{ 
              paddingLeft: '3rem', 
              paddingRight: '10.5rem',
              resize: 'none',
              overflowY: query.length > 50 ? 'auto' : 'hidden',
              minHeight: '3.5rem',
              lineHeight: '1.5',
              borderRadius: query.length > 50 ? '24px' : 'var(--border-radius-full)'
            }}
            autoComplete="off"
          />
          <div style={{ position: 'absolute', right: '0.25rem', top: '0.25rem', display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
            <button
              type="button"
              onClick={toggleListening}
              style={{
                background: isListening ? 'rgba(239, 68, 68, 0.1)' : 'transparent',
                border: 'none',
                color: isListening ? '#ef4444' : 'var(--text-muted)',
                cursor: 'pointer',
                padding: '0.5rem',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s',
                transform: isListening ? 'scale(1.1)' : 'scale(1)'
              }}
              title="Voice Search"
            >
              <Mic size={20} />
            </button>
            <button
              type="submit"
              className="btn-primary"
              style={{
                padding: '0 1rem',
                borderRadius: 'var(--border-radius-full)',
                fontSize: '0.875rem',
                height: '3rem'
              }}
              disabled={isSearching || isAskingDJ}
            >
              Go
            </button>
          </div>
        </div>
      </form>

      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {!hasSearched && (
          <div style={{ textAlign: 'center', opacity: 0.4, marginTop: '3rem' }}>
            <Music size={56} style={{ margin: '0 auto', marginBottom: '1rem' }} />
            <p className="body-text">Search for any song to add it to the queue.</p>
          </div>
        )}

        {(isSearching || isAskingDJ) && (
          <div style={{ textAlign: 'center', marginTop: '2rem' }}>
            <div style={{
              width: '40px', height: '40px',
              border: '3px solid var(--glass-border)',
              borderTopColor: isAskingDJ ? '#a855f7' : 'var(--primary-accent)',
              borderRadius: '50%',
              margin: '0 auto',
              animation: 'spin 0.8s linear infinite'
            }} />
            <p className="body-text" style={{ marginTop: '1rem' }}>
              {isAskingDJ ? 'The DJ is reading the room...' : 'Searching YouTube...'}
            </p>
          </div>
        )}

        {djResponse && !isAskingDJ && (
          <div className="glass-panel animate-fade-in" style={{ padding: '1.5rem', background: 'rgba(168, 85, 247, 0.1)', border: '1px solid rgba(168, 85, 247, 0.3)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
              <Sparkles size={18} color="#a855f7" />
              <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#e9d5ff', margin: 0 }}>Session DJ</h3>
            </div>
            <p className="body-text" style={{ fontSize: '0.95rem', marginBottom: '1.5rem', color: '#f3e8ff' }}>
              "{djResponse.message}"
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {djResponse.recommended_queries?.map((rec, i) => (
                <button
                  key={i}
                  className="btn-primary"
                  style={{
                    background: 'rgba(168, 85, 247, 0.2)',
                    border: '1px solid rgba(168, 85, 247, 0.4)',
                    color: '#e9d5ff',
                    padding: '0.5rem 1rem',
                    fontSize: '0.85rem',
                    borderRadius: 'var(--border-radius-full)'
                  }}
                  onClick={() => {
                    setQuery(rec);
                    handleSearch(null, rec, true);
                  }}
                >
                  {rec}
                </button>
              ))}
            </div>
          </div>
        )}

        {hasSearched && !isSearching && !isAskingDJ && !djResponse && results.length === 0 && (
          <p className="body-text" style={{ textAlign: 'center', marginTop: '2rem' }}>No results found. Try a different search.</p>
        )}

        {!isSearching && results.map((track, i) => (
          <div
            key={track.videoId || i}
            className="glass-panel animate-fade-in"
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '0.875rem',
              gap: '1rem',
              animationDelay: `${i * 0.07}s`,
              cursor: 'pointer',
              transition: 'background 0.2s ease',
            }}
            onClick={() => {
              onSelect(track);
              setQuery('');
              setResults([]);
              setHasSearched(false);
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.07)'}
            onMouseLeave={e => e.currentTarget.style.background = ''}
          >
            {track.albumArt ? (
              <img
                src={track.albumArt}
                alt={track.title}
                style={{ width: '64px', height: '48px', borderRadius: '6px', objectFit: 'cover', flexShrink: 0 }}
              />
            ) : (
              <div style={{ width: '64px', height: '48px', borderRadius: '6px', background: 'var(--glass-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Music2 size={20} color="var(--text-muted)" />
              </div>
            )}

            <div style={{ flex: 1, minWidth: 0 }}>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 600, lineHeight: 1.3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                {track.title ? track.title.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>') : ''}
              </h3>
              <p className="body-text" style={{ fontSize: '0.8rem', marginTop: '0.2rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {track.artist ? track.artist.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>') : ''}
              </p>
            </div>

            <ChevronRight size={18} color="var(--text-muted)" style={{ flexShrink: 0 }} />
          </div>
        ))}
      </div>
    </div>
  );
}
