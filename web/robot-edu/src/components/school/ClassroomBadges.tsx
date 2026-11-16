import { Badge } from '../ui/Badge';
import { cn } from '../../utils/cn';
import { classroomStatusPresentation } from '../../queries/classroomsModel';

/** The classroom code as a quiet outlined chip with tabular figures. Used wherever a classroom is named so the code reads
 *  the same in lists, headers and dialogs; it identifies, so it carries no accent colour. */
export function ClassroomCodeTag({ code, className }: { code: string; className?: string }) {
  return (
    <span className={cn('inline-flex h-5 max-w-full items-center truncate rounded-[4px] border border-line-strong px-1.5 text-xs font-medium tabular-nums text-ink-muted', className)}>
      <span className="sr-only">Classroom code </span>{code}
    </span>
  );
}

export function ClassroomStatusBadge({ status }: { status: string }) {
  const { label, tone } = classroomStatusPresentation(status);
  return <Badge tone={tone} dot>{label}</Badge>;
}
