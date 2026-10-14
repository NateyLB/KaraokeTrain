"use client";

import { useState } from 'react';
import { Search, Music2, ChevronRight, ChevronDown, Music, Sparkles, Mic } from 'lucide-react';
import { useSongSearch } from '../hooks/useSongSearch';
import SongSearchResult from './SongSearchResult';

export default function SearchBar({ onSelect, defaultCatalogOpen = true }) {
  const [isCatalogOpen, setIsCatalogOpen] = useState(defaultCatalogOpen);
  const { query, setQuery, results, clearResults, isSearching, hasSearched, isAskingDJ, djResponse,
    isListening, toggleListening, catalog, isLoadingCatalog, catalogError, reloadCatalog, searchError, handleSearch } = useSongSearch();
  const handleSelect = async track => {
    const result = await onSelect(track);
    if (result !== null) clearResults();
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem', minHeight: 0 }}>
      <form onSubmit={(e) => handleSearch(e)} style={{ position: 'relative' }}>
        <div style={{ position: 'relative' }}>
          <Search
            size={18}
            color="var(--text-muted)"
            style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', zIndex: 5 }}
          />
          <input
            type="text"
            className="input-field"
            placeholder="Search or ask the DJ..."
            aria-label="Search songs or ask the DJ"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSearch(e);
              }
            }}
            style={{
              width: '100%',
              padding: '0 5.5rem 0 2.5rem',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid var(--glass-border)',
              borderRadius: '24px',
              color: 'var(--text-main)',
              fontSize: '0.95rem',
              height: '2.75rem',
            }}
            autoComplete="off"
          />
          <div style={{ position: 'absolute', right: '0.25rem', top: '50%', transform: 'translateY(-50%)', display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
            <button
              type="button"
              onClick={toggleListening}
              style={{
                background: isListening ? 'rgba(239, 68, 68, 0.1)' : 'transparent',
                border: 'none',
                color: isListening ? '#ef4444' : 'var(--text-muted)',
                cursor: 'pointer',
                padding: '0',
                width: '2.25rem',
                height: '2.25rem',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s',
                transform: isListening ? 'scale(1.1)' : 'scale(1)'
              }}
              title="Voice Search"
            >
              <Mic size={18} />
            </button>
            <button
              type="submit"
              className="btn-primary"
              style={{
                padding: '0 1rem',
                borderRadius: 'var(--border-radius-full)',
                fontSize: '0.85rem',
                height: '2.25rem',
                border: 'none'
              }}
              disabled={isSearching || isAskingDJ}
            >
              Go
            </button>
          </div>
        </div>
      </form>
      {searchError && <p role="alert" style={{ color: '#ef4444' }}>{searchError}</p>}

      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {!hasSearched && (
          <div style={{ marginTop: '0.5rem' }}>
            <button type="button" aria-expanded={isCatalogOpen}
              style={{ width: '100%', background: 'none', border: 0, textAlign: 'left', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: isCatalogOpen ? '1rem' : '0', padding: '0 0 0 0.5rem', cursor: 'pointer' }}
              onClick={() => setIsCatalogOpen(!isCatalogOpen)}
            >
              <Music2 size={18} color="var(--primary-accent)" />
              <span style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-main)', margin: 0 }}>Ready to Sing</span>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginLeft: 'auto', display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                <span>{isLoadingCatalog ? 'Loading...' : catalogError ? 'Unavailable' : `${catalog.length} songs`}</span>
                {isCatalogOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </span>
            </button>
            
            <div style={{ 
              maxHeight: isCatalogOpen ? '300px' : '0px', 
              overflow: 'hidden', 
              transition: 'all 0.3s ease-in-out',
              opacity: isCatalogOpen ? 1 : 0
            }}>
              {catalogError ? (
                <div role="alert" style={{ textAlign: 'center', margin: '1rem 0' }}>
                  <p className="body-text">{catalogError}</p>
                  <button type="button" className="btn-secondary" style={{ marginTop: '0.75rem' }} onClick={reloadCatalog}>Retry</button>
                </div>
              ) : isLoadingCatalog && catalog.length === 0 ? (
                 <div style={{ textAlign: 'center', opacity: 0.4, marginTop: '1rem', marginBottom: '1rem' }}>
                   <Music size={40} style={{ margin: '0 auto', marginBottom: '1rem' }} className="animate-pulse-glow" />
                   <p className="body-text">Loading catalog...</p>
                 </div>
               ) : catalog.length === 0 ? (
                 <div style={{ textAlign: 'center', opacity: 0.4, marginTop: '1rem', marginBottom: '1rem' }}>
                   <Music size={56} style={{ margin: '0 auto', marginBottom: '1rem' }} />
                   <p className="body-text">Search for any song to add it to the queue.</p>
                 </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '230px', overflowY: 'auto', paddingRight: '0.2rem' }}>
                  {catalog.map(track => <SongSearchResult key={track.videoId} track={track} compact onSelect={handleSelect} />)}
                </div>
              )}
            </div>
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

        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem', paddingBottom: '1rem' }}>
          {djResponse && !isAskingDJ && (
          <div className="glass-panel animate-fade-in" style={{ padding: '1.5rem', background: 'rgba(168, 85, 247, 0.1)', border: '1px solid rgba(168, 85, 247, 0.3)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
              <Sparkles size={18} color="#a855f7" />
              <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#e9d5ff', margin: 0 }}>Session DJ</h3>
            </div>
            <p className="body-text" style={{ fontSize: '0.95rem', marginBottom: '1.5rem', color: '#f3e8ff' }}>
              &quot;{djResponse.message}&quot;
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

        {!isSearching && results.map(track => <SongSearchResult key={track.videoId} track={track} onSelect={handleSelect} />)}
        </div>
      </div>
    </div>
  );
}
