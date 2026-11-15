import { useEffect, useRef, useState } from 'react';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';

interface Props {
  /** The student to remove, or null when closed. */
  student: { name: string; email: string | null } | null;
  classroomName: string;
  pending: boolean;
  onConfirm: () => Promise<unknown>;
  onClose: () => void;
}

/**
 * Replaces the browser confirm for removing a student (A02). Copy follows the service: the classroom membership becomes
 * "removed" and only this classroom's enrollment is revoked; enrollments from other classrooms and all learning records
 * are untouched. The dialog stays open with the server's message when removal fails.
 */
export function RemoveStudentDialog({ student, classroomName, pending, onConfirm, onClose }: Props) {
  const [error, setError] = useState<string | null>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (student) setError(null); }, [student]);

  const confirm = async () => {
    if (pending) return;
    setError(null);
    try { await onConfirm(); } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The student couldn’t be removed. Try again.');
      window.setTimeout(() => confirmRef.current?.focus(), 0); // it was disabled while pending, which drops focus
    }
  };

  return (
    <Dialog open={Boolean(student)} onClose={() => { if (!pending) onClose(); }} size="sm" className="vista-school"
      title="Remove student?"
      description={student && <span className="block min-w-0"><span className="font-medium text-ink [overflow-wrap:anywhere]">{student.name}</span>{student.email && <span className="block text-ink-muted [overflow-wrap:anywhere]">{student.email}</span>}</span>}
      footer={<>
        <Button variant="secondary" onClick={onClose} disabled={pending} data-autofocus>Cancel</Button>
        <Button ref={confirmRef} variant="danger" onClick={() => void confirm()} loading={pending}>{pending ? 'Removing…' : 'Remove student'}</Button>
      </>}>
      <div className="space-y-3 text-sm text-ink-muted">
        <p>They leave <span className="font-medium text-ink">{classroomName}</span> and lose the course access this classroom gives them. Access through their other classrooms isn’t affected.</p>
        <p>Their progress and submissions are kept. You can add them back later.</p>
        {error && <p role="alert" className="border-l-4 border-danger bg-danger-soft p-3 text-danger">{error}</p>}
      </div>
    </Dialog>
  );
}
