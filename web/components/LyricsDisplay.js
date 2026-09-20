"use client";

import { useEffect, useRef, useMemo, useState } from 'react';
import useKaraokeStore from '../store/useKaraokeStore';

export default function LyricsDisplay({ lyrics, currentTime }) {
  const containerRef = useRef(null);
  const activeLineRef = useRef(null);
  const [offsetY, setOffsetY] = useState(0);
  
  const isMultiVersion = lyrics && lyrics.length > 0 && lyrics[0].lyrics;
  const selectedVersionIdx = useKaraokeStore(s => s.selectedVersionIdx);
  const setSelectedVersionIdx = useKaraokeStore(s => s.setSelectedVersionIdx);

  useEffect(() => {
    if (isMultiVersion && selectedVersionIdx === 0) {
        const romanizedIdx = lyrics.findIndex(v => v.label && v.label.includes('Romanized'));
        if (romanizedIdx !== -1 && romanizedIdx !== selectedVersionIdx) {
            setSelectedVersionIdx(romanizedIdx);
        }
    }
  }, [lyrics, isMultiVersion]);

  const activeLyricsList = isMultiVersion ? (lyrics[selectedVersionIdx]?.lyrics || []) : lyrics;

  const activeIndex = useMemo(() => {
    if (!activeLyricsList || activeLyricsList.length === 0) return -1;
    
    // Bulletproof search: find the line with the maximum time that is <= currentTime
    let bestIdx = -1;
    let maxTime = -1;
    for (let i = 0; i < activeLyricsList.length; i++) {
      let lineStartTime = activeLyricsList[i].time;
      const activeWords = activeLyricsList[i].words || [];
      
      // Activate the line slightly before the first word (0.3s) so it doesn't pop in already-highlighting
      if (currentTime >= (lineStartTime - 0.3) && lineStartTime >= maxTime) {
        maxTime = lineStartTime;
        bestIdx = i;
      }
    }
    return bestIdx;
  }, [currentTime, activeLyricsList]);

  // Use CSS hardware-accelerated transforms for perfectly smooth, interruptible scrolling
  useEffect(() => {
    if (activeLineRef.current && containerRef.current) {
      const container = containerRef.current;
      const element = activeLineRef.current;
      
      // Anchor the active lyric at 25% from the top of the container
      // This leaves room for 1 past line, and massive room for future lines!
      const targetScroll = element.offsetTop - (container.clientHeight * 0.25) + (element.clientHeight / 2);
      setOffsetY(-targetScroll);
    }
  }, [activeIndex]);

  if (!lyrics || lyrics.length === 0) {
    return (
      <div className="glass-panel" style={{ padding: '2rem', textAlign: 'center' }}>
        <p className="body-text">No synced lyrics available.</p>
      </div>
    );
  }

  return (
    <>
      <style>{`
        .lyric-box {
          height: 100%;
          max-height: 100%;
        }
        @media (orientation: landscape) and (min-width: 1024px) {
          .lyric-box {
            max-height: 750px;
            width: 100%;
          }
        }

        .lyric-line {
          margin: 1.5rem 0;
          transition: all 0.3s ease;
          font-size: 1.25rem;
          text-align: center;
          font-weight: 500;
        }
        .lyric-line-active {
          font-size: 2.2rem;
          transform: scale(1.05);
          text-shadow: 0 0 20px rgba(139, 92, 246, 0.4);
        }
        
        /* Landscape on phones (height is small) */
        @media (orientation: landscape) and (max-height: 500px) {
           .lyric-line {
             font-size: 1rem !important;
             margin: 1rem 0 !important;
           }
           .lyric-line-active {
             font-size: 1.5rem !important;
           }
        }
        
        /* Landscape on tablets/small laptops */
        @media (orientation: landscape) and (max-width: 1024px) and (min-height: 501px) {
           .lyric-line {
             font-size: 1.1rem !important;
           }
           .lyric-line-active {
             font-size: 1.75rem !important;
           }
        }
      `}</style>
      <div 
        ref={containerRef}
        className="lyric-box"
        style={{
          boxSizing: 'border-box',
          overflow: 'hidden', // Disable native scroll, we use CSS transforms
          position: 'relative',
          maskImage: 'linear-gradient(to bottom, transparent 0%, black 15%, black 70%, transparent 100%)',
          WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 15%, black 70%, transparent 100%)',
          padding: 'clamp(1rem, 5vh, 3rem) 1rem'
        }}
      >
      <div style={{
        transform: `translateY(${offsetY}px)`,
        transition: 'transform 0.5s cubic-bezier(0.25, 1, 0.5, 1)',
        width: '100%'
      }}>
        {activeLyricsList.map((line, index) => {
        const isActive = index === activeIndex;
        const isPast = index < activeIndex;
        // In case we still need nextTime for interpolation logic
        const nextTime = index < activeLyricsList.length - 1 ? activeLyricsList[index + 1].time : Infinity;

        let styleClass = 'body-text lyric-line';
        let customStyle = {};

        if (isActive) {
          styleClass = 'heading-2 lyric-line lyric-line-active'; 
          customStyle = {};
          
          let trueStartTime = line.time;
          let trueEndTime = nextTime !== Infinity ? nextTime : line.time + 5;
          let activeWords = line.words || [];
          
          if (activeWords.length > 0 && activeWords[0].start != null && activeWords[activeWords.length - 1].end != null) {
              // The backend Python script has already validated and cleaned the word timestamps.
              // We fully trust them, even if they drastically differ from the studio line.time (e.g. for Live versions).
              trueStartTime = activeWords[0].start;
              trueEndTime = activeWords[activeWords.length - 1].end;
          }
          
          const duration = trueEndTime - trueStartTime;
          
          return (
            <div 
              key={index} 
              ref={isActive ? activeLineRef : null}
              className={styleClass}
              style={customStyle}
            >
              {activeWords.length > 0 ? activeWords.map((wObj, wIdx) => {
                let wordProgress = 0;
                if (wObj.start != null && wObj.end != null) {
                  const wDuration = wObj.end - wObj.start;
                  if (currentTime >= wObj.start && wDuration > 0) {
                      wordProgress = (currentTime - wObj.start) / wDuration;
                  }
                  if (currentTime > wObj.end) wordProgress = 1;
                } else {
                  // Fallback if timestamps are missing
                  wordProgress = currentTime >= trueStartTime ? 1 : 0;
                }
                
                wordProgress = Math.max(0, Math.min(1, wordProgress)) * 100;
                const isSinging = wordProgress > 0 && wordProgress < 100;
                
                // Add a space after the word if it doesn't have one and isn't the last word
                // Whisper sometimes includes trailing spaces, LRCLIB split does not.
                const needsSpace = !wObj.word.endsWith(' ') && wIdx < activeWords.length - 1;
                
                return (
                  <span 
                    key={wIdx} 
                    style={{
                      backgroundImage: `linear-gradient(to right, #ffffff, #ffffff), linear-gradient(to right, var(--primary-accent), var(--primary-accent))`,
                      backgroundRepeat: 'no-repeat, no-repeat',
                      backgroundPosition: '0 0, 0 0',
                      backgroundSize: `${wordProgress}% 100%, 100% 100%`,
                      WebkitBackgroundClip: 'text, text',
                      backgroundClip: 'text, text',
                      WebkitTextFillColor: 'transparent',
                      color: 'transparent',
                      transition: isSinging ? 'background-size 0.05s linear' : 'none',
                      display: 'inline'
                    }}
                  >
                    {wObj.word}{needsSpace ? ' ' : ''}
                  </span>
                );
              }) : (
                <span style={{ color: 'var(--primary-accent)' }}>
                  {line.text}
                </span>
              )}
            </div>
          );
        } else if (isPast) {
          customStyle.color = 'var(--text-muted)';
          customStyle.opacity = 0.5;
        } else {
          customStyle.color = 'var(--text-main)';
          customStyle.opacity = 0.8;
        }

        return (
          <div 
            key={index} 
            className={styleClass}
            style={customStyle}
          >
            {line.text}
          </div>
        );
      })}
      </div>
      </div>
    </>
  );
}
