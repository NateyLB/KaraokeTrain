'use client';
import { useEffect, useRef, useState } from 'react';
import useKaraokeStore from '../store/useKaraokeStore';

export function useSongSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [isAskingDJ, setIsAskingDJ] = useState(false);
  const [djResponse, setDjResponse] = useState(null);
  const [isListening, setIsListening] = useState(false);
  const [catalog, setCatalog] = useState([]);
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(true);
  const [catalogError, setCatalogError] = useState('');
  const [catalogReload, setCatalogReload] = useState(0);
  const [searchError, setSearchError] = useState('');
  const recognition = useRef(null);
  const pendingSearch = useRef(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/catalog', { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]) })
      .then(async response => {
        const data = await response.json();
        if (!response.ok || !Array.isArray(data)) throw new Error('Saved songs are temporarily unavailable.');
        if (!controller.signal.aborted) setCatalog(data);
      }).catch(() => {
        if (!controller.signal.aborted) setCatalogError('Saved songs are temporarily unavailable. Please try again.');
      }).finally(() => { if (!controller.signal.aborted) setIsLoadingCatalog(false); });
    return () => controller.abort();
  }, [catalogReload]);

  useEffect(() => () => {
    pendingSearch.current?.abort();
    const speech = recognition.current;
    if (speech) { speech.onstart = speech.onresult = speech.onerror = speech.onend = null; speech.abort(); }
  }, []);

  const reloadCatalog = () => { setIsLoadingCatalog(true); setCatalogError(''); setCatalogReload(value => value + 1); };
  const clearResults = () => {
    pendingSearch.current?.abort();
    setQuery(''); setResults([]); setHasSearched(false); setIsSearching(false); setIsAskingDJ(false); setSearchError('');
  };

  const toggleListening = () => {
    if (isListening) { recognition.current?.stop(); return; }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) { setSearchError('Voice search is unavailable in this browser. Please type your search.'); return; }
    const speech = new SpeechRecognition();
    recognition.current = speech;
    speech.continuous = false;
    speech.interimResults = true;
    speech.onstart = () => { setIsListening(true); setQuery(''); };
    speech.onresult = event => setQuery(Array.from(event.results, result => result[0].transcript).join(''));
    speech.onerror = () => { setIsListening(false); setSearchError('Voice search could not start. Check microphone access.'); };
    speech.onend = () => setIsListening(false);
    try { speech.start(); } catch { setIsListening(false); setSearchError('Voice search could not start. Please try again.'); }
  };

  const handleSearch = async (event, overrideQuery = null, forceYoutube = false) => {
    event?.preventDefault?.();
    const text = (overrideQuery ?? query).trim();
    if (!text) return;
    pendingSearch.current?.abort();
    const controller = new AbortController();
    pendingSearch.current = controller;
    const wantsDJ = !forceYoutube && (/^(what|can|should|could|would|recommend|suggest|how|give|some|play|any|good|who|need)\b/i.test(text) || text.includes('?') || text.split(/\s+/).length >= 6);
    setIsAskingDJ(wantsDJ); setIsSearching(!wantsDJ); setHasSearched(true); setDjResponse(null); setResults([]); setSearchError('');
    try {
      const party = useKaraokeStore.getState().partyState;
      const response = await fetch(wantsDJ ? '/api/dj' : `/api/search?q=${encodeURIComponent(text)}`, {
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(wantsDJ ? 65000 : 20000)]),
        ...(wantsDJ ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
          prompt: text, history: party?.history || [], currentSong: party?.currentSong, queue: party?.queue || [],
        }) } : {}),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Search is temporarily unavailable. Please try again.');
      if (controller.signal.aborted) return;
      if (wantsDJ) setDjResponse(data); else setResults(Array.isArray(data) ? data : []);
    } catch (error) {
      if (!controller.signal.aborted) setSearchError(error.message || 'Search failed. Please try again.');
    } finally {
      if (pendingSearch.current === controller) { setIsAskingDJ(false); setIsSearching(false); }
    }
  };

  return { query, setQuery, results, clearResults, isSearching, hasSearched, isAskingDJ, djResponse,
    isListening, toggleListening, catalog, isLoadingCatalog, catalogError, reloadCatalog, searchError, handleSearch };
}
