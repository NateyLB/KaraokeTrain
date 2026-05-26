"use client";

import { useState } from 'react';
import { Search, Music2, ChevronRight, Music } from 'lucide-react';

export default function SearchBar({ onSelect }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;

    setIsSearching(true);
    setHasSearched(true);

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
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2rem' }}>
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
            placeholder="Search YouTube for a song..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ paddingLeft: '3rem', paddingRight: '5rem' }}
            autoComplete="off"
          />
          <button
            type="submit"
            className="btn-primary"
            style={{
              position: 'absolute',
              right: '0.25rem',
              top: '0.25rem',
              bottom: '0.25rem',
              padding: '0 1.25rem',
              borderRadius: 'var(--border-radius-full)',
              fontSize: '0.875rem'
            }}
            disabled={isSearching}
          >
            {isSearching ? '...' : 'Search'}
          </button>
        </div>
      </form>

      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {!hasSearched && (
          <div style={{ textAlign: 'center', opacity: 0.4, marginTop: '3rem' }}>
            <Music size={56} style={{ margin: '0 auto', marginBottom: '1rem' }} />
            <p className="body-text">Search for any song to add it to the queue.</p>
          </div>
        )}

        {isSearching && (
          <div style={{ textAlign: 'center', marginTop: '2rem' }}>
            <div style={{
              width: '40px', height: '40px',
              border: '3px solid var(--glass-border)',
              borderTopColor: 'var(--primary-accent)',
              borderRadius: '50%',
              margin: '0 auto',
              animation: 'spin 0.8s linear infinite'
            }} />
            <p className="body-text" style={{ marginTop: '1rem' }}>Searching YouTube...</p>
            {/* spin keyframe is defined in globals.css */}
          </div>
        )}

        {hasSearched && !isSearching && results.length === 0 && (
          <p className="body-text" style={{ textAlign: 'center', marginTop: '2rem' }}>No results found. Try a different search.</p>
        )}

        {!isSearching && results.map((track, i) => (
          <div
            key={track.id}
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
            onClick={() => onSelect(track)}
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
              <h3 style={{ fontSize: '0.95rem', fontWeight: 600, lineHeight: 1.3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{track.title}</h3>
              <p className="body-text" style={{ fontSize: '0.8rem', marginTop: '0.2rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{track.artist}</p>
            </div>

            <ChevronRight size={18} color="var(--text-muted)" style={{ flexShrink: 0 }} />
          </div>
        ))}
      </div>
    </div>
  );
}
