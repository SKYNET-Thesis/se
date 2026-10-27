import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { PauseIcon, PlayIcon } from 'lucide-react';
import type { HomeAsset } from './homeAssets';

/**
 * Muted, inline video loop with a poster. It plays only while visible, never autoplays with
 * reduced motion, and always offers a visible Pause/Play control (WCAG 2.2.2).
 */
export function VideoFrame({ asset, onError }: { asset: HomeAsset; onError: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const reduceMotion = useReducedMotion();
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const node = video.current;
    if (!node || reduceMotion || !('IntersectionObserver' in window)) return undefined;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) void node.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
      else { node.pause(); setPlaying(false); }
    }, { threshold: 0.4 });
    observer.observe(node);
    return () => observer.disconnect();
  }, [reduceMotion]);

  const toggle = () => {
    const node = video.current;
    if (!node) return;
    if (node.paused) void node.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    else { node.pause(); setPlaying(false); }
  };

  const sources = asset.sources?.length ? asset.sources : asset.src ? [{ src: asset.src, type: '' }] : [];
  return (
    <>
      <video
        ref={video}
        muted
        playsInline
        loop
        preload="none"
        poster={asset.poster}
        aria-label={asset.alt}
        onError={onError}
        className="absolute inset-0 h-full w-full object-cover"
        style={{ objectPosition: asset.objectPosition }}>
        {sources.map((source) => <source key={source.src} src={source.src} type={source.type || undefined} onError={onError} />)}
      </video>
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? 'Pause video' : 'Play video'}
        className="absolute bottom-3 right-3 z-10 inline-flex h-11 w-11 items-center justify-center rounded-[10px] bg-[var(--vh-surface)] text-[var(--vh-ink)] ring-1 ring-[var(--vh-line-strong)] transition-colors hover:bg-[var(--vh-ground)]">
        {playing ? <PauseIcon className="h-4 w-4" aria-hidden /> : <PlayIcon className="h-4 w-4" aria-hidden />}
      </button>
    </>
  );
}
