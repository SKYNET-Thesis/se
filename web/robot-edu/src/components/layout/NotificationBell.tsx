import { useQueries, useQuery } from '@tanstack/react-query';
import { BellIcon } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useRole } from '../../contexts/RoleContext';
import { useSupabaseSession } from '../../contexts/SupabaseSessionContext';
import { instructorApi, learnerApi } from '../../lib/api';
import { studentNotifications, teacherNotifications, type NotificationSummary } from '../../queries/notificationModel';
import { studentLearningKeys } from '../../queries/studentLearningQueries';
import { teacherLearningKeys } from '../../queries/teacherLearningQueries';

/** Real-data hook: students see open assignments, instructors see submissions awaiting review. Other roles have no source. */
export function useNotificationSummary(): NotificationSummary | null {
  const { session, sessionRevision } = useSupabaseSession() as ReturnType<typeof useSupabaseSession> & { sessionRevision?: number };
  const { role } = useRole();
  const token = session?.access_token ?? '';
  const student = role === 'student';
  const teacher = role === 'teacher' || role === 'teaching_assistant';
  const learning = useQuery({ queryKey: studentLearningKeys.list(session?.user.id, sessionRevision ?? 0), queryFn: () => learnerApi.myLearning(token), enabled: Boolean(token && student), staleTime: 30_000, refetchInterval: 60_000 });
  const rooms = useQuery({ queryKey: teacherLearningKeys.teachingClassrooms, queryFn: () => instructorApi.teachingClassrooms(token), enabled: Boolean(token && teacher), staleTime: 30_000 });
  const roomList = useMemo(() => rooms.data ?? [], [rooms.data]);
  const submissions = useQueries({ queries: roomList.map((room) => ({ queryKey: teacherLearningKeys.submissions(room.id), queryFn: () => instructorApi.submissions(room.id, token), enabled: Boolean(token && teacher), staleTime: 30_000, refetchInterval: 60_000, retry: false })) });
  if (student) return studentNotifications(learning.data);
  if (teacher) return teacherNotifications(roomList, submissions.map((query) => query.data));
  return null;
}

export function NotificationBell() {
  const summary = useNotificationSummary();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (event: PointerEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false); };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); triggerRef.current?.focus(); } };
    document.addEventListener('pointerdown', onPointer); document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onPointer); document.removeEventListener('keydown', onKey); };
  }, [open]);
  if (!summary) return null;
  const label = summary.count ? `Notifications, ${summary.count} pending` : 'Notifications, none pending';
  return (
    <div ref={rootRef} className="relative">
      <button ref={triggerRef} type="button" onClick={() => setOpen((value) => !value)} aria-label={label} aria-haspopup="true" aria-expanded={open} data-testid="notification-bell"
        className="relative rounded-md p-2 text-ink-muted hover:bg-sunken hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
        <BellIcon className="h-5 w-5" aria-hidden />
        {summary.count > 0 && <span aria-hidden className="absolute -right-0.5 -top-0.5 grid min-w-[18px] place-items-center rounded-full bg-danger px-1 text-[11px] font-semibold leading-[18px] text-white">{summary.count > 99 ? '99+' : summary.count}</span>}
      </button>
      {open && (
        <div role="region" aria-label="Pending items" className="absolute right-0 top-11 z-30 w-[min(92vw,340px)] rounded-md border border-line bg-surface p-2 shadow-pop">
          <p className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">{summary.heading}</p>
          {summary.items.length === 0 ? <p className="px-2 py-4 text-sm text-ink-muted">{summary.emptyText}</p> : (
            <ul className="max-h-80 overflow-y-auto">{summary.items.map((item) => (
              <li key={item.id}><Link to={item.to} onClick={() => setOpen(false)} className="block rounded px-2 py-2 hover:bg-sunken focus-visible:bg-sunken focus-visible:outline-none"><span className="block truncate text-sm font-medium text-ink">{item.title}</span><span className="block truncate text-xs text-ink-muted">{item.detail}</span></Link></li>))}</ul>
          )}
        </div>
      )}
    </div>
  );
}
