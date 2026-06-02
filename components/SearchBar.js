"use client";

import { useState } from 'react';
import { Search, Music2, ChevronRight, Music, Sparkles } from 'lucide-react';
import useKaraokeStore from '../store/useKaraokeStore';

export default function SearchBar({ onSelect }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [isAskingDJ, setIsAskingDJ] = useState(false);
  const [djResponse, setDjResponse] = useState(null);

  const askDJ = async (e) => {
    e.preventDefault();
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
          prompt: query,
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

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;

    // Smart Routing Heuristic:
    // Route to DJ if it starts with a question/request word, contains a question mark, or is a long sentence.
    const isQuestionWord = /^(what|can|should|could|would|recommend|suggest|how|give|some|play|any|good|who|need)\b/i.test(query.trim());
    const hasQuestionMark = query.includes('?');
    const isConversational = query.trim().split(/\s+/).length >= 6;

    if (isQuestionWord || hasQuestionMark || isConversational) {
      return askDJ(e);
    }

    // Otherwise route to YouTube search
    setIsSearching(true);
    setHasSearched(true);
    setDjResponse(null);

    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
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
      <form onSubmit={handleSearch} style={{ position: 'relative' }}>
        <div style={{ position: 'relative' }}>
          <Search
            size={20}
            color="var(--text-muted)"
            style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
          />
          <input
            type="text"
            className="input-field"
            placeholder="Search YouTube or Ask the DJ..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ paddingLeft: '3rem', paddingRight: '8.5rem' }}
            autoComplete="off"
          />
          <div style={{ position: 'absolute', right: '0.25rem', top: '0.25rem', bottom: '0.25rem', display: 'flex', gap: '0.25rem' }}>
            <button
              type="submit"
              className="btn-primary"
              style={{
                padding: '0 1rem',
                borderRadius: 'var(--border-radius-full)',
                fontSize: '0.875rem'
              }}
              disabled={isSearching || isAskingDJ}
            >
              Search
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
                    handleSearch({ preventDefault: () => {} });
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
