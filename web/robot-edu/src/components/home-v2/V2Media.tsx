import { cn } from '../../utils/cn';
import { DeferredMedia } from './DeferredMedia';
import { homeAssets, type HomeAssetId } from '../home/media/homeAssets';

const RATIO: Record<string, string> = {
  '4:5': 'aspect-[4/5]', '1:1': 'aspect-square', '9:8': 'aspect-[9/8]', '6:5': 'aspect-[6/5]', '4:3': 'aspect-[4/3]', '3:2': 'aspect-[3/2]', '16:10': 'aspect-[16/10]', '16:9': 'aspect-video',
};
const RATIO_LG: Record<string, string> = {
  '4:5': 'lg:aspect-[4/5]', '1:1': 'lg:aspect-square', '9:8': 'lg:aspect-[9/8]', '6:5': 'lg:aspect-[6/5]', '4:3': 'lg:aspect-[4/3]', '3:2': 'lg:aspect-[3/2]', '16:10': 'lg:aspect-[16/10]', '16:9': 'lg:aspect-video',
};

interface V2MediaProps {
  id: HomeAssetId;
  /** Overrides the manifest's ratios when a V2 composition needs a different crop of the same asset. */
  ratio?: string;
  ratioLg?: string;
  className?: string;
  frameClassName?: string;
  caption?: string | false;
  shutter?: boolean;
  delay?: number;
}

/**
 * V2 media window: square-cut (no card), its space reserved by the ratio, the manifest's approved image,
 * video or screenshot inside, otherwise its designed fallback. Credits come from the manifest.
 */
export function V2Media({ id, ratio, ratioLg, className, frameClassName, caption, shutter, delay = 0 }: V2MediaProps) {
  const asset = homeAssets[id];
  const base = ratio ?? asset.ratio.base;
  const lg = ratioLg ?? asset.ratio.lg;
  const text = caption === false ? undefined : caption ?? asset.caption;
  return (
    <figure className={cn('m-0', className)}>
      <div data-shutter={shutter ? '' : undefined} style={{ ['--d' as string]: delay }} className={cn('relative isolate overflow-hidden bg-[var(--v2-graphite-2)]', RATIO[base], lg && RATIO_LG[lg], frameClassName)}>
        <DeferredMedia id={id} />
      </div>
      {(text || asset.credit) && (
        <figcaption className="mt-3 max-w-[64ch] text-[13px] leading-[1.5] text-[var(--v2-muted)]">
          {text}
          {asset.credit && <span className="mt-1 block">{asset.creditHref ? <a href={asset.creditHref} className="underline underline-offset-2">{asset.credit}</a> : asset.credit}{asset.licence ? ` ${asset.licence}` : ''}</span>}
        </figcaption>
      )}
    </figure>
  );
}
