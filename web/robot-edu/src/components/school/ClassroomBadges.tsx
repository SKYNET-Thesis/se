import { Badge } from '../ui/Badge';
import { cn } from '../../utils/cn';
import { classroomStatusPresentation } from '../../queries/classroomsModel';

/** The classroom code as a lab-station tag: Ocean Water plate, navy figures, a Sunset Orange notch. Used wherever a
 *  classroom is named so the code reads the same in the list, the detail header and dialogs. */
export function ClassroomCodeTag({ code, className }: { code: string; className?: string }) {
  return (
    <span className={cn('inline-flex h-5 max-w-full items-center truncate rounded-[4px] border-l-[3px] border-[rgb(var(--vista-signal))] bg-accent-soft px-1.5 text-xs font-medium tabular-nums text-accent-ink', className)}>
      <span className="sr-only">Classroom code </span>{code}
    </span>
  );
}

export function ClassroomStatusBadge({ status }: { status: string }) {
  const { label, tone } = classroomStatusPresentation(status);
  return <Badge tone={tone} dot>{label}</Badge>;
}
