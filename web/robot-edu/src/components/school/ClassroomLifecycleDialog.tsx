import { useEffect, useRef, useState } from 'react';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import type { ApiSchoolClassroom } from '../../lib/api';
import { ClassroomCodeTag } from './ClassroomBadges';
import { lifecycleErrorMessage } from '../../queries/classroomLifecycleModel';

interface Props {
  action: 'archive' | 'reactivate';
  classroom: ApiSchoolClassroom | null;
  pending: boolean;
  onConfirm: () => Promise<unknown>;
  onClose: () => void;
}

/** Confirms archive or reactivate. Focus starts on Cancel; the dialog closes only after the server confirms. */
export function ClassroomLifecycleDialog({ action, classroom, pending, onConfirm, onClose }: Props) {
  const [error, setError] = useState<string | null>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { setError(null); }, [classroom?.id, action]);
  const archive = action === 'archive';
  const confirm = async () => {
    setError(null);
    try { await onConfirm(); } catch (cause) {
      setError(lifecycleErrorMessage(cause, archive ? 'archive' : 'reactivate'));
      window.setTimeout(() => confirmRef.current?.focus(), 0); // it was disabled while pending, which drops focus
    }
  };
  return (
    <Dialog open={Boolean(classroom)} onClose={() => { if (!pending) onClose(); }} size="sm" className="vista-school"
      title={archive ? 'Archive classroom?' : 'Reactivate classroom?'}
      description={classroom && <span className="inline-flex flex-wrap items-center gap-2"><span className="font-medium text-ink">{classroom.name}</span><ClassroomCodeTag code={classroom.code} /></span>}
      footer={<><Button variant="secondary" onClick={onClose} disabled={pending} data-autofocus>Cancel</Button>
        <Button ref={confirmRef} variant={archive ? 'danger' : 'primary'} onClick={() => void confirm()} loading={pending}>{pending ? (archive ? 'Archiving…' : 'Reactivating…') : archive ? 'Archive classroom' : 'Reactivate classroom'}</Button></>}>
      <div className="space-y-3 text-sm text-ink-muted">
        {archive ? (
          <>
            <p>Students lose the course access this classroom gives them. Anyone who is also in another active classroom keeps access through that one.</p>
            <p>Progress, submissions, grades, saved programs and robot run records are kept. You can reactivate the classroom later.</p>
          </>
        ) : (
          <p>The classroom becomes active again. Its students get course access back if its course is still running, and you can change its course and manage it as before.</p>
        )}
        {error && <p role="alert" className="border-l-4 border-danger bg-danger-soft p-3 text-danger">{error}</p>}
      </div>
    </Dialog>
  );
}
