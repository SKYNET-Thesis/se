import { useCallback, useState } from 'react';
import { cn } from '../../../utils/cn';
import type { HomeAsset } from './homeAssets';

/**
 * Approved image or screenshot from the manifest, cropped to its frame with the manifest's object position.
 * While it loads, the frame's own tone shows (its space is already reserved); the image then fades in.
 */
export function ImageMedia({ asset, priority = false, onError }: { asset: HomeAsset; priority?: boolean; onError: () => void }) {
  const [loaded, setLoaded] = useState(false);
  // A cached image can finish before React attaches onLoad.
  const ref = useCallback((node: HTMLImageElement | null) => { if (node?.complete && node.naturalWidth > 0) setLoaded(true); }, []);
  return (
    <img
      ref={ref}
      src={asset.src}
      srcSet={asset.srcSet}
      sizes={asset.sizes ?? '(min-width: 1024px) 50vw, 100vw'}
      alt={asset.alt}
      width={asset.width}
      height={asset.height}
      loading={priority ? 'eager' : 'lazy'}
      decoding="async"
      onLoad={() => setLoaded(true)}
      onError={onError}
      aria-busy={!loaded || undefined}
      className={cn('absolute inset-0 h-full w-full motion-safe:transition-opacity motion-safe:duration-500', asset.fit === 'contain' ? 'object-contain' : 'object-cover', loaded ? 'opacity-100' : 'opacity-0')}
      style={{ objectPosition: asset.objectPosition }} />
  );
}
