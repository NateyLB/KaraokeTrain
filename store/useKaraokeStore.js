'use client';
import { create } from 'zustand';

const useKaraokeStore = create((set, get) => ({
  // === Party/Queue (from server polling) ===
  partyState: null,
  currentJobId: null,
  setPartyState: (v) => set({ partyState: v }),
  setCurrentJobId: (v) => set({ currentJobId: v }),

  // === Synced Settings (bi-directional Host <-> Remote via server) ===
  isPlaying: false,
  lyricsOffset: 0,
  firstValidTime: 0,
  vocalsEnabled: true,
  vocalsVolume: 1.0,
  micEnabled: false,
  micVolume: 1.0,
  echoOn: false,
  autoTuneOn: false,
  echoCancellationOn: true,
  isVideoVisible: true,

  setIsPlaying: (v) => set({ isPlaying: v }),
  setLyricsOffset: (v) => set(state => ({ lyricsOffset: typeof v === 'function' ? v(state.lyricsOffset) : v })),
  setFirstValidTime: (v) => set({ firstValidTime: v }),
  setVocalsEnabled: (v) => set({ vocalsEnabled: v }),
  setVocalsVolume: (v) => set({ vocalsVolume: v }),
  setMicEnabled: (v) => set({ micEnabled: v }),
  setMicVolume: (v) => set({ micVolume: v }),
  setEchoOn: (v) => set({ echoOn: v }),
  setAutoTuneOn: (v) => set({ autoTuneOn: v }),
  setEchoCancellationOn: (v) => set({ echoCancellationOn: v }),
  setIsVideoVisible: (v) => set({ isVideoVisible: v }),

  // Helper to get all synced settings as an object
  getSyncedSettings: () => {
    const s = get();
    return {
      isPlaying: s.isPlaying,
      lyricsOffset: s.lyricsOffset,
      firstValidTime: s.firstValidTime,
      vocalsEnabled: s.vocalsEnabled,
      vocalsVolume: s.vocalsVolume,
      micEnabled: s.micEnabled,
      micVolume: s.micVolume,
      echoOn: s.echoOn,
      autoTuneOn: s.autoTuneOn,
      echoCancellationOn: s.echoCancellationOn,
      isVideoVisible: s.isVideoVisible,
    };
  },

  // === Playback (Room-only) ===
  currentSongTime: 0,
  duration: 0,
  stems: null,
  setCurrentSongTime: (v) => set({ currentSongTime: v }),
  setDuration: (v) => set({ duration: v }),
  setStems: (v) => set({ stems: v }),

  // === Lyrics (Room-only) ===
  parsedLyrics: [],
  guideNotes: [],
  lyricsSource: 'Loading...',
  setParsedLyrics: (v) => set({ parsedLyrics: v }),
  setGuideNotes: (v) => set({ guideNotes: v }),
  setLyricsSource: (v) => set({ lyricsSource: v }),

  // === UI ===
  isLoading: false,
  loadingStatus: '',
  isSearchOpen: false,
  isQueueOpen: false,
  isInfoOpen: false,
  isMicExpanded: false,
  isRecordingExpanded: false,
  hostUrl: '',
  toast: '',

  setIsLoading: (v) => set({ isLoading: v }),
  setLoadingStatus: (v) => set({ loadingStatus: v }),
  setIsSearchOpen: (v) => set({ isSearchOpen: v }),
  setIsQueueOpen: (v) => set({ isQueueOpen: v }),
  setIsInfoOpen: (v) => set({ isInfoOpen: v }),
  setIsMicExpanded: (v) => set({ isMicExpanded: v }),
  setIsRecordingExpanded: (v) => set({ isRecordingExpanded: v }),
  setHostUrl: (v) => set({ hostUrl: v }),
  setToast: (v) => set({ toast: v }),

  // === Batch reset for new song ===
  resetForNewSong: () => set({
    isPlaying: false,
    currentSongTime: 0,
    duration: 0,
    stems: null,
    parsedLyrics: [],
    guideNotes: [],
    lyricsSource: 'Loading...',
    lyricsOffset: 0,
    firstValidTime: 0,
  }),
}));

export default useKaraokeStore;
