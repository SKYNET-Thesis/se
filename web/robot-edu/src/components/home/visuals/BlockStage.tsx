import type { CSSProperties, ReactNode } from 'react';
import { cn } from '../../../utils/cn';

/**
 * The Homepage motif: the tab of a VISTA program block (the connector that lets blocks snap
 * together), enlarged into a stage. It appears at very different scales: the hero stage, the
 * lesson stage and the block chips that mark each step.
 */
interface BlockStageProps {
  color: string;
  className?: string;
  /** Distance of the tab from the stage's left edge. */
  tabLeft?: string;
  tabWidth?: string;
  tabHeight?: string;
  style?: CSSProperties;
  children?: ReactNode;
}

export function BlockStage({ color, className, tabLeft = 'clamp(24px, 4%, 56px)', tabWidth = 'clamp(72px, 16%, 224px)', tabHeight = 'clamp(16px, 2.2vw, 28px)', style, children }: BlockStageProps) {
  return (
    <div className={cn('relative rounded-[28px] transition-colors duration-300', className)} style={{ backgroundColor: color, ...style }}>
      <span aria-hidden className="absolute bottom-full rounded-t-[14px] transition-colors duration-300" style={{ left: tabLeft, width: tabWidth, height: tabHeight, backgroundColor: color }} />
      {children}
    </div>
  );
}

/** The same shape at text size: a block chip used as the marker beside each step. */
export function BlockChip({ color, active = false, className }: { color: string; active?: boolean; className?: string }) {
  return (
    <span aria-hidden className={cn('relative mt-[0.18em] inline-block h-[0.62em] w-[0.95em] shrink-0 rounded-[0.14em] transition-transform duration-300', active && 'motion-safe:scale-110', className)} style={{ backgroundColor: color }}>
      <span className="absolute bottom-full left-[0.14em] h-[0.12em] w-[0.36em] rounded-t-[0.06em]" style={{ backgroundColor: color }} />
    </span>
  );
}
