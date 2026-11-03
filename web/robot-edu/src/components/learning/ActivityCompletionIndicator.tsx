import { CheckIcon, LockIcon } from 'lucide-react';
import type { ActivityCompletionState } from './activityCompletionState';

export function ActivityCompletionIndicator({
  state,
  activityTitle,
}: {
  state: ActivityCompletionState;
  activityTitle: string;
}) {
  const label = state === 'completed' ? 'completed' : state === 'locked' ? 'locked' : 'not completed';
  return (
    <span
      role="img"
      aria-label={`${activityTitle}: ${label}`}
      data-completion={state}
      className={`grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border ${
        state === 'completed'
          ? 'border-ok bg-ok text-white'
          : state === 'locked'
            ? 'border-line-strong bg-sunken text-ink-subtle'
            : 'border-line-strong bg-surface text-ink-subtle'
      }`}
    >
      {state === 'completed' ? <CheckIcon aria-hidden="true" className="h-3 w-3" strokeWidth={3} /> : null}
      {state === 'locked' ? <LockIcon aria-hidden="true" className="h-2.5 w-2.5" strokeWidth={2.5} /> : null}
    </span>
  );
}
