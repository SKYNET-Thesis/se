import { useState, type ReactNode } from 'react';
import { renderHomeFallback } from '../fallbacks/HomeFallbacks';
import { BrowserFrame } from './BrowserFrame';
import { ImageMedia } from './ImageMedia';
import { VideoFrame } from './VideoFrame';
import { homeAssets, isApproved, type HomeAsset, type HomeAssetId } from './homeAssets';

/**
 * Asset debug overlays are opt-in: development build AND `?assetDebug=1` in the URL.
 * They are never part of the visual design and never ship in production builds.
 */
function assetDebugEnabled(): boolean {
  if (!import.meta.env.DEV || typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('assetDebug') === '1';
}

function DevAssetBadge({ asset }: { asset: HomeAsset }) {
  return (
    <span title={asset.recommended} className="pointer-events-none absolute right-2 top-2 z-20 max-w-[calc(100%-1rem)] truncate rounded-[6px] bg-black/75 px-2 py-1 font-mono text-[11px] leading-4 text-white">
      {asset.id} ({asset.status}) → public/media/home/{asset.folder}/
    </span>
  );
}

interface AssetMediaProps {
  id: HomeAssetId;
  /** State-driven designed fallback; defaults to the manifest's fallback visual. */
  fallback?: ReactNode;
  priority?: boolean;
  /** Override the manifest's browser chrome (e.g. `false` to show a screenshot unframed on a stage). */
  chrome?: boolean;
}

/**
 * Renders an approved asset (image, screenshot or video) or its designed fallback. Missing,
 * unapproved or failing media always falls back; nothing public says "coming soon".
 */
export function AssetMedia({ id, fallback, priority = false, chrome }: AssetMediaProps) {
  const asset = homeAssets[id];
  const [failed, setFailed] = useState(false);
  const [debug] = useState(assetDebugEnabled);
  const designed = fallback ?? renderHomeFallback(asset.fallback);
  const live = isApproved(asset) && !failed && asset.kind !== 'model3d';
  const media = !live ? designed : asset.kind === 'video'
    ? <VideoFrame asset={asset} onError={() => setFailed(true)} />
    : <ImageMedia asset={asset} priority={priority} onError={() => setFailed(true)} />;
  const framed = (chrome ?? Boolean(asset.chrome)) && asset.chrome;

  return (
    <>
      {framed
        ? <BrowserFrame title={framed.screen} className="absolute inset-0 rounded-none ring-0">{media}</BrowserFrame>
        : media}
      {debug && !isApproved(asset) && <DevAssetBadge asset={asset} />}
    </>
  );
}
