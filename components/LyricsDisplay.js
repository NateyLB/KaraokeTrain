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
      
      const targetScroll = element.offsetTop - (container.clientHeight / 2) + (element.clientHeight / 2);
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
    <div 
      ref={containerRef}
      style={{
        height: '40vh',
        overflow: 'hidden', // Disable native scroll, we use CSS transforms
        position: 'relative',
        maskImage: 'linear-gradient(to bottom, transparent, black 10%, black 90%, transparent)',
        WebkitMaskImage: 'linear-gradient(to bottom, transparent, black 10%, black 90%, transparent)',
        padding: '2rem 1rem'
      }}
      className="lyrics-container"
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

        let styleClass = 'body-text';
        let customStyle = { 
          margin: '1.5rem 0', 
          transition: 'all 0.3s ease',
          fontSize: '1.25rem',
          textAlign: 'center',
          fontWeight: '500'
        };

        if (isActive) {
          styleClass = 'heading-2 animate-pulse-glow'; // Removed text-gradient to allow custom word colors
          customStyle = {
            ...customStyle,
            fontSize: '2rem',
            transform: 'scale(1.05)',
          };
          
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
          
          if (activeWords.length === 0) {
              const wordsText = line.text.split(' ');
              const maxDuration = trueEndTime - trueStartTime;
              // Highlight at a natural reading/singing speed (max 0.3s per word)
              // This prevents the gradient from dragging slowly across gaps.
              const syntheticDuration = Math.min(maxDuration, wordsText.length * 0.3);
              
              const timePerWord = syntheticDuration / Math.max(1, wordsText.length);
              activeWords = wordsText.map((w, i) => ({
                  word: w,
                  start: trueStartTime + (i * timePerWord),
                  end: trueStartTime + ((i + 1) * timePerWord)
              }));
          }
          let progress = 0;
          if (currentTime >= trueStartTime) {
              if (duration > 0) {
                  progress = (currentTime - trueStartTime) / duration;
              } else {
                  progress = 1;
              }
          }
          if (currentTime > trueEndTime) progress = 1;
          progress = Math.max(0, Math.min(1, progress)) * 100;

          return (
            <div 
              key={index} 
              ref={isActive ? activeLineRef : null}
              className={styleClass.replace('animate-pulse-glow', '')} // Remove box-shadow glow
              style={{
                ...customStyle, 
                textAlign: 'center',
                textShadow: '0 0 20px rgba(139, 92, 246, 0.4)' // Add text glow instead of box glow
              }}
            >
              {activeWords.map((wObj, wIdx) => {
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
              })}
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
  );
}
