import { useEffect, useState } from 'react';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import type { ApiSchoolClassroom } from '../../lib/api';
import { ClassroomCodeTag } from './ClassroomBadges';

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
  useEffect(() => { setError(null); }, [classroom?.id, action]);
  const archive = action === 'archive';
  const confirm = async () => {
    setError(null);
    try { await onConfirm(); } catch (cause) { setError(cause instanceof Error ? cause.message : archive ? 'The classroom could not be archived. Try again.' : 'The classroom could not be reactivated. Try again.'); }
  };
  return (
    <Dialog open={Boolean(classroom)} onClose={() => { if (!pending) onClose(); }} size="sm" className="vista-school"
      title={archive ? 'Archive classroom?' : 'Reactivate classroom?'}
      description={classroom && <span className="inline-flex flex-wrap items-center gap-2"><span className="font-medium text-ink">{classroom.name}</span><ClassroomCodeTag code={classroom.code} /></span>}
      footer={<><Button variant="secondary" onClick={onClose} disabled={pending} data-autofocus>Cancel</Button>
        <Button variant={archive ? 'danger' : 'primary'} onClick={() => void confirm()} loading={pending}>{pending ? (archive ? 'Archiving…' : 'Reactivating…') : archive ? 'Archive classroom' : 'Reactivate classroom'}</Button></>}>
      <div className="space-y-3 text-sm text-ink-muted">
        {archive ? (
          <>
            <p>Active enrollments through this classroom are revoked. A student keeps course access through any other active classroom.</p>
            <p>Progress, submissions, grades, program versions and evidence stay intact. You can reactivate the classroom later.</p>
          </>
        ) : (
          <p>The classroom becomes active again, so you can change its course offering and manage it as before.</p>
        )}
        {error && <p role="alert" className="border-l-4 border-danger bg-danger-soft p-3 text-danger">{error}</p>}
      </div>
    </Dialog>
  );
}
