import type { CSSProperties, ReactNode } from 'react';
import { cn } from '../../../utils/cn';
import type { MediaCredit } from './manifest';

export type FrameRatio = '4:5' | '1:1' | '9:8' | '6:5' | '4:3' | '3:2' | '16:10' | '16:9';

const RATIO: Record<FrameRatio, string> = {
  '4:5': 'aspect-[4/5]',
  '6:5': 'aspect-[6/5]',
  '1:1': 'aspect-square',
  '9:8': 'aspect-[9/8]',
  '4:3': 'aspect-[4/3]',
  '3:2': 'aspect-[3/2]',
  '16:10': 'aspect-[16/10]',
  '16:9': 'aspect-video',
};

const RATIO_MD: Record<FrameRatio, string> = {
  '4:5': 'md:aspect-[4/5]',
  '6:5': 'md:aspect-[6/5]',
  '1:1': 'md:aspect-square',
  '9:8': 'md:aspect-[9/8]',
  '4:3': 'md:aspect-[4/3]',
  '3:2': 'md:aspect-[3/2]',
  '16:10': 'md:aspect-[16/10]',
  '16:9': 'md:aspect-video',
};

const RATIO_LG: Record<FrameRatio, string> = {
  '4:5': 'lg:aspect-[4/5]',
  '6:5': 'lg:aspect-[6/5]',
  '1:1': 'lg:aspect-square',
  '9:8': 'lg:aspect-[9/8]',
  '4:3': 'lg:aspect-[4/3]',
  '3:2': 'lg:aspect-[3/2]',
  '16:10': 'lg:aspect-[16/10]',
  '16:9': 'lg:aspect-video',
};

const TONE = {
  ground: 'bg-[var(--vh-ground)]',
  surface: 'bg-[var(--vh-surface)] ring-1 ring-inset ring-[var(--vh-line)]',
  deep: 'bg-[var(--vh-deep)] text-white',
  /** No fill of its own: the frame takes `frameStyle.backgroundColor` or shows the field behind it. */
  none: '',
} as const;

const RADIUS = { frame: 'rounded-[16px]', panel: 'rounded-[20px]', block: 'rounded-[28px]' } as const;

export interface MediaFrameProps {
  /** Ratio below the md breakpoint, and everywhere unless `ratioMd` is set. Space is always reserved. */
  ratio: FrameRatio;
  ratioMd?: FrameRatio;
  ratioLg?: FrameRatio;
  tone?: keyof typeof TONE;
  radius?: keyof typeof RADIUS;
  /** The block-tab motif on the frame's top edge, filled with this colour (usually the frame's own). */
  tab?: { color: string; left?: string; width?: string };
  frameStyle?: CSSProperties;
  caption?: ReactNode;
  credit?: MediaCredit;
  className?: string;
  frameClassName?: string;
  children: ReactNode;
}

/** Fixed-ratio media container: any image, video, model or fallback can be swapped inside without layout shift. */
export function MediaFrame({ ratio, ratioMd, ratioLg, tone = 'surface', radius = 'frame', tab, frameStyle, caption, credit, className, frameClassName, children }: MediaFrameProps) {
  return (
    <figure className={cn('m-0', tab && 'pt-[var(--vh-tab-h)]', className)}>
      <div className="relative">
        {tab && <span aria-hidden className="absolute bottom-full rounded-t-[14px]" style={{ left: tab.left ?? 'clamp(24px, 6%, 64px)', width: tab.width ?? 'clamp(72px, 18%, 200px)', height: 'var(--vh-tab-h)', backgroundColor: tab.color }} />}
        <div className={cn('relative isolate overflow-hidden', RATIO[ratio], ratioMd && RATIO_MD[ratioMd], ratioLg && RATIO_LG[ratioLg], TONE[tone], RADIUS[radius], tab && 'rounded-tl-[14px]', frameClassName)} style={frameStyle}>
          {children}
        </div>
      </div>
      {(caption || credit) && (
        <figcaption className="mt-3 max-w-[62ch] text-[14px] leading-5 text-[var(--vh-muted)]">
          {caption}
          {credit && (
            <span className="mt-1 block text-[13px]">
              {credit.href ? <a href={credit.href} className="underline underline-offset-2">{credit.text}</a> : credit.text}
              {credit.licence ? ` ${credit.licence}` : ''}
            </span>
          )}
        </figcaption>
      )}
    </figure>
  );
}
