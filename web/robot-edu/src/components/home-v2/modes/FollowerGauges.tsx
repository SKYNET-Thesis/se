import { cn } from '../../../utils/cn';
import { followerPose, JOINT_LIMITS, type HandTarget, type Joint } from './model';

const JOINTS: Array<{ joint: Joint; label: string }> = [
  { joint: 'Rotation', label: 'Rotation' },
  { joint: 'Pitch', label: 'Pitch' },
  { joint: 'Elbow', label: 'Elbow' },
];
const deg = (r: number) => Math.round((r * 180) / Math.PI);

/**
 * VR learning's stage overlay (H6.9): what the visitor learns there is the mapping from a hand to the
 * arm's joints, so each joint the follower drives is drawn as a gauge across its URDF limit, with the
 * computed target marked. Computed on this page from the pad; not telemetry. On phones it is one row of
 * the three values across the foot of the stage, so it does not cover the arm (H6.9 CP3).
 */
export function FollowerGauges({ hand, className }: { hand: HandTarget; className?: string }) {
  const p = followerPose(hand);
  return (
    <div className={cn('w-[min(260px,72%)] rounded-[4px] bg-[rgb(8_9_10/0.88)] px-3 py-2.5 max-sm:w-auto max-sm:py-2', className)}>
      <p className="text-[13px] text-[var(--v2-soft)]">Hand to joints, computed on this page</p>
      <dl className="mt-2 grid gap-2 max-sm:mt-1 max-sm:grid-cols-3">
        {JOINTS.map(({ joint, label }) => {
          const [lo, hi] = JOINT_LIMITS[joint];
          const f = (p[joint] - lo) / (hi - lo);
          return (
            <div key={joint} className="grid grid-cols-[64px_1fr_44px] items-center gap-2 max-sm:grid-cols-[auto_auto] max-sm:justify-start max-sm:gap-1.5">
              <dt className="text-[13px] text-[var(--v2-soft)]">{label}</dt>
              <dd aria-hidden className="relative h-[6px] rounded-full bg-white/[0.12] max-sm:hidden">
                {/* The joint's zero, marked on its scale. */}
                <span className="absolute -inset-y-[3px] left-1/2 w-[2px] -translate-x-1/2 rounded-full bg-white/30" />
                <span className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--v2-teal)]" style={{ left: `${Math.min(100, Math.max(0, f * 100))}%` }} />
              </dd>
              <dd className="v2-num text-right text-[13px] text-[var(--v2-text)] max-sm:text-left">{deg(p[joint])}°</dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}
