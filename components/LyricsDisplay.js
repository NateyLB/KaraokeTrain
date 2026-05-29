"use client";

import { useEffect, useRef, useMemo, useState } from 'react';

export default function LyricsDisplay({ lyrics, currentTime }) {
  const containerRef = useRef(null);
  const activeLineRef = useRef(null);
  const [offsetY, setOffsetY] = useState(0);

  const activeIndex = useMemo(() => {
    if (!lyrics || lyrics.length === 0) return -1;
    
    // Bulletproof search: find the line with the maximum time that is <= currentTime
    let bestIdx = -1;
    let maxTime = -1;
    for (let i = 0; i < lyrics.length; i++) {
      if (currentTime >= lyrics[i].time && lyrics[i].time >= maxTime) {
        maxTime = lyrics[i].time;
        bestIdx = i;
      }
    }
    return bestIdx;
  }, [currentTime, lyrics]);

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
          max-height: 40vh;
        }
        @media (orientation: landscape) {
          .lyric-box {
            max-height: 75vh;
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
        className="lyrics-container lyric-box"
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
        {lyrics.map((line, index) => {
        const isActive = index === activeIndex;
        const isPast = index < activeIndex;
        // In case we still need nextTime for interpolation logic
        const nextTime = index < lyrics.length - 1 ? lyrics[index + 1].time : Infinity;

        let styleClass = 'body-text lyric-line';
        let customStyle = {};

        if (isActive) {
          styleClass = 'heading-2 lyric-line lyric-line-active'; 
          customStyle = {};
          
          let trueStartTime = line.time;
          let trueEndTime = nextTime !== Infinity ? nextTime : line.time + 5;
          let activeWords = line.words || [];
          
          if (activeWords.length > 0 && activeWords[0].start != null && activeWords[activeWords.length - 1].end != null) {
              // SANITY CHECK: If Whisper's alignment is wildly disconnected from the official LRCLIB timestamp,
              // it means Whisper hallucinated or aligned to the wrong phrase. We throw away the bad Whisper data
              // and fall back to perfectly-anchored synthetic highlighting for this specific line.
              if (Math.abs(activeWords[0].start - line.time) > 2.0) {
                  activeWords = [];
              } else {
                  trueStartTime = activeWords[0].start;
                  trueEndTime = activeWords[activeWords.length - 1].end;
              }
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
                      backgroundImage: `linear-gradient(to right, #ffffff ${wordProgress}%, var(--primary-accent) ${wordProgress}%)`,
                      WebkitBackgroundClip: 'text',
                      backgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      color: 'transparent',
                      transition: isSinging ? 'none' : 'background 0.1s linear',
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
