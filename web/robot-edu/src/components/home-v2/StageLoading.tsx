import { cn } from '../../utils/cn';
import { useV2Scene } from './V2Scene';

/**
 * Sits inside a 3D window (H6.8, from the H6.7 studies). While the SO-101 loads, the window says so on
 * the page ground with an indeterminate bar, instead of showing an empty canvas; if the preview cannot
 * start, it says that. Without WebGL the poster path already shows its own fallback, so nothing is added.
 */
export function StageLoading({ className }: { className?: string }) {
  const { mode, status } = useV2Scene();
  if (mode !== '3d' || status === 'ready') return null;
  const failed = status === 'error';
  return (
    <div role="status" className={cn('pointer-events-none absolute inset-0 grid place-items-center bg-[var(--v2-void)]', className)}>
      <p className="flex items-center gap-3 text-[14px] text-[var(--v2-soft)]">
        {!failed && <span aria-hidden className="v2-loading-bar relative h-[3px] w-24 overflow-hidden rounded-full bg-white/10"><span className="absolute inset-y-0 left-0 w-1/3 rounded-full bg-[var(--v2-teal)]" /></span>}
        {failed ? 'The 3D preview could not start here.' : 'Loading the SO-101 model…'}
      </p>
    </div>
  );
}
