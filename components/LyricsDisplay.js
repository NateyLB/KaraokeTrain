"use client";

import { memo, useCallback, useLayoutEffect, useRef, useMemo } from 'react';
import useKaraokeStore from '../store/useKaraokeStore';
import { selectedLyrics, prepareLyricTimeline, lyricPlaybackState, wordProgress, wordSeparator } from '../lib/lyrics/timeline';

const LyricLine = memo(function LyricLine({ line, index, featured, past, time, resting, finished, activeRef }) {
  return (
    <div ref={featured ? activeRef : null}
      className={`lyric-line${featured ? ' lyric-line-featured lyric-line-active' : ''}`}
      data-line-index={index} data-featured={featured || undefined}
      data-singing={featured && !resting && time >= line.start && time < line.end || undefined}
      style={{ opacity: featured ? (finished ? .5 : 1) : past ? .4 : .75 }}>
      {line.words.length ? line.words.map((word, wordIndex) => {
        const progress = wordProgress(word, time) * 100;
        const highlighting = featured && !resting && !finished;
        return <span key={wordIndex} className="lyric-word" data-progress={highlighting ? progress.toFixed(1) : undefined}
          style={highlighting ? {
            backgroundImage: 'linear-gradient(#fff,#fff), linear-gradient(var(--primary-accent),var(--primary-accent))',
            backgroundRepeat: 'no-repeat', backgroundPosition: '0 0',
            backgroundSize: `${progress}% 100%,100% 100%`, backgroundClip: 'text', WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent', color: 'transparent',
          } : undefined}>
          {word.word}{wordSeparator(word.word, line.words[wordIndex + 1]?.word)}
        </span>;
      }) : line.text}
    </div>
  );
});

export default function LyricsDisplay({ lyrics, currentTime }) {
  const containerRef = useRef(null);
  const contentRef = useRef(null);
  const activeLineRef = useRef(null);
  const previousFrameRef = useRef(null);
  const positionRef = useRef(null);
  const selectedVersionIdx = useKaraokeStore(s => s.selectedVersionIdx);
  const timeline = useMemo(() => prepareLyricTimeline(selectedLyrics(lyrics, selectedVersionIdx)), [lyrics, selectedVersionIdx]);
  const state = lyricPlaybackState(timeline, currentTime);

  const positionLine = useCallback((duration = 400) => {
    const container = containerRef.current;
    const content = contentRef.current;
    const line = activeLineRef.current;
    if (!container || !content || !line) return;
    const padding = parseFloat(getComputedStyle(container).paddingTop) || 0;
    const target = container.clientHeight * .25 - padding - line.offsetTop - line.offsetHeight / 2;
    if (positionRef.current != null && Math.abs(target - positionRef.current) < .5 &&
      content.style.transform === `translateY(${target}px)`) return;
    content.style.transitionDuration = `${duration}ms`;
    content.style.transform = `translateY(${target}px)`;
    positionRef.current = target;
  }, []);

  useLayoutEffect(() => {
    const previous = previousFrameRef.current;
    const changed = !previous || previous.index !== state.index || previous.timeline !== timeline;
    if (changed) {
      const discontinuity = !previous || previous.timeline !== timeline || Math.abs(currentTime - previous.time) > 1;
      positionLine(discontinuity ? 0 : 400);
    }
    previousFrameRef.current = { time: currentTime, index: state.index, timeline };
  }, [currentTime, state.index, timeline, positionLine]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return;
    let frame;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => positionLine(0));
    });
    observer.observe(container);
    observer.observe(content);
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, [timeline, positionLine]);

  if (!timeline.length) return <div className="glass-panel" style={{ padding: '2rem', textAlign: 'center' }}>
    <p className="body-text">No synced lyrics available.</p>
  </div>;

  return <>
    <style>{`
      .lyric-box { height:100%; max-height:100%; }
      .lyric-line {
        margin:1.4rem 0; font-size:clamp(1.75rem,5vw,2.2rem); line-height:1.5;
        text-align:center; font-weight:500; color:var(--text-main);
        transform:scale(.82); transform-origin:center;
        transition:opacity .18s ease,transform .25s ease;
      }
      .lyric-line-featured { transform:scale(1.05); text-shadow:0 0 20px rgba(139,92,246,.4); }
      .lyric-word { display:inline; transition:background-size .04s linear; }
      .lyric-status { position:absolute; top:0; left:0; right:0; text-align:center; font-size:.85rem; color:var(--text-muted); z-index:1; }
      @media (orientation:landscape) and (max-height:500px) {
        .lyric-line { font-size:1.25rem; margin:.7rem 0; }
      }
      @media (prefers-reduced-motion:reduce) {
        .lyric-content,.lyric-line,.lyric-word { transition:none !important; }
        .lyric-line { transform:none; }
      }
    `}</style>
    <div className="lyric-box" style={{ position:'relative',boxSizing:'border-box' }}>
      {state.rest && state.countdown > 0 && <div className="lyric-status" aria-live="off">
        {currentTime < timeline[0].start ? 'Vocals' : 'Instrumental · Vocals'} in {state.countdown}s
      </div>}
      <div ref={containerRef} style={{ height:'100%',boxSizing:'border-box',overflow:'hidden',position:'relative',
        maskImage:'linear-gradient(to bottom,transparent 0%,black 15%,black 70%,transparent 100%)',
        WebkitMaskImage:'linear-gradient(to bottom,transparent 0%,black 15%,black 70%,transparent 100%)',
        padding:'clamp(1rem,5vh,3rem) 1.2rem' }}>
        <div ref={contentRef} className="lyric-content" style={{ position:'relative',display:'flow-root',width:'100%',
          transform:'translateY(0)',transition:'transform 400ms cubic-bezier(.25,1,.5,1)' }}>
          {timeline.map((line,index) => <LyricLine key={index} line={line} index={index}
            featured={index===state.index} past={index<state.index} time={index===state.index ? currentTime : 0}
            resting={index===state.index && state.rest} finished={index===state.index && Boolean(state.finished)} activeRef={activeLineRef} />)}
        </div>
      </div>
    </div>
  </>;
}
