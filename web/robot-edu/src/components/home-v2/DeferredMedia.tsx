import { useEffect, useRef, useState } from 'react';
import { AssetMedia } from '../home/media/AssetMedia';
import type { HomeAssetId } from '../home/media/homeAssets';

/**
 * A manifest asset (or its designed fallback) mounted only once the reader is within about a screen
 * and a half of it, so the first render builds the page, not every screen on it. The frame around it
 * already reserves the space by its ratio, so nothing moves when it mounts.
 *
 * `minWidth` (H6.9): a frame narrower than this shows the screen as one picture, laid out at that width
 * and scaled down whole, the way a screenshot would be. The designed fallbacks size their text to the
 * viewport, so in a phone-sized frame they would otherwise overflow it and be cut at the edges.
 */
export function DeferredMedia({ id, minWidth }: { id: HomeAssetId; minWidth?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(() => typeof IntersectionObserver === 'undefined');
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    const node = ref.current;
    if (near || !node) return undefined;
    const io = new IntersectionObserver(([e]) => { if (e?.isIntersecting) { setNear(true); io.disconnect(); } }, { rootMargin: '150% 0px' });
    // Watch the chapter, not this box: the box often sits inside an entrance mask or a role wipe
    // (clip-path), which the observer treats as zero area, so the screen would mount only once the mask
    // had opened and pop in empty-then-full (H6.9 CP3: the Learn screen was blank for ~2 s on arrival).
    io.observe(node.closest('section') ?? node);
    return () => io.disconnect();
  }, [near]);
  useEffect(() => {
    const node = ref.current;
    if (!minWidth || !node || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([e]) => { if (e) setBox({ w: e.contentRect.width, h: e.contentRect.height }); });
    ro.observe(node);
    return () => ro.disconnect();
  }, [minWidth]);
  const scale = minWidth && box && box.w > 0 && box.w < minWidth ? box.w / minWidth : 1;
  const media = near && <AssetMedia id={id} chrome={false} />;
  return (
    <div ref={ref} className="absolute inset-0 overflow-hidden">
      {scale < 1 && box
        ? <div className="absolute left-0 top-0 origin-top-left" style={{ width: minWidth, height: box.h / scale, transform: `scale(${scale})` }}>{media}</div>
        : media}
    </div>
  );
}
