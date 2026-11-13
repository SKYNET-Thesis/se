import { useQuery } from '@tanstack/react-query';
import { ChevronLeftIcon, InboxIcon, LockIcon, SearchIcon, UsersIcon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { assignmentKind } from '../../components/submission/submissionState';
import { SubmissionReviewDetail } from '../../components/teacher/SubmissionReviewDetail';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { inputClasses } from '../../components/ui/Field';
import { useSupabaseSession } from '../../contexts/SupabaseSessionContext';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { ApiError, assignmentApi, instructorApi } from '../../lib/api';
import { teacherLearningKeys } from '../../queries/teacherLearningQueries';
import { filterSubmissions, formatDateTime, stageLabel, submissionStage, summarizeSubmissions, type StageFilter } from '../../queries/teacherSubmissionsModel';

const selectClass = `${inputClasses} h-9 py-0`;
const tone = (stage: ReturnType<typeof submissionStage>) => (stage === 'released' ? 'ok' : stage === 'assessed' ? 'accent' : 'warn');
const stageFilters: Array<{ value: StageFilter; label: string }> = [{ value: 'all', label: 'All' }, { value: 'awaiting', label: 'Awaiting assessment' }, { value: 'assessed', label: 'Assessed' }, { value: 'released', label: 'Released' }];

function Stat({ label, value, active, onClick }: { label: string; value: number; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={`rounded-lg border px-4 py-3 text-left transition-colors ${active ? 'border-accent bg-accent-soft/50' : 'border-line bg-surface hover:bg-sunken/50'}`}>
      <span className="block text-xs text-ink-muted">{label}</span><span className="mt-0.5 block text-2xl font-semibold tabular-nums text-ink">{value}</span>
    </button>
  );
}

/** All scope decisions stay in NestJS; the browser only identifies a classroom or submission. */
export function TeacherSubmissions() {
  const { session } = useSupabaseSession();
  const token = session?.access_token ?? '';
  const [params, setParams] = useSearchParams();
  const classroomId = params.get('classroomId') ?? '';
  const assignmentId = params.get('assignmentId') ?? '';
  const submissionId = params.get('submissionId') ?? '';
  const [stage, setStage] = useState<StageFilter>('all');
  const [searchText, setSearchText] = useState('');
  const search = useDebouncedValue(searchText, 250);

  const update = (patch: Record<string, string>) => setParams((current) => { const next = new URLSearchParams(current); Object.entries(patch).forEach(([key, value]) => (value ? next.set(key, value) : next.delete(key))); return next; }, { replace: true });

  const classrooms = useQuery({ queryKey: teacherLearningKeys.teachingClassrooms, queryFn: () => instructorApi.teachingClassrooms(token), enabled: Boolean(token) });
  const assignments = useQuery({ queryKey: teacherLearningKeys.assignments(classroomId), queryFn: () => assignmentApi.list(classroomId, token), enabled: Boolean(token && classroomId) });
  const submissions = useQuery({ queryKey: teacherLearningKeys.submissions(classroomId), queryFn: () => instructorApi.submissions(classroomId, token), enabled: Boolean(token && classroomId) });

  useEffect(() => { if (!classroomId && classrooms.data?.length === 1) update({ classroomId: classrooms.data[0].id }); }, [classroomId, classrooms.data]);

  const publishedAssignments = (assignments.data ?? []).filter((item) => item.status !== 'draft' && assignmentKind(item.constraints) !== 'quiz');
  const all = submissions.data ?? [];
  const scoped = useMemo(() => filterSubmissions(all, { assignmentId, search, stage: 'all' }), [all, assignmentId, search]);
  const summary = summarizeSubmissions(scoped);
  const visible = useMemo(() => filterSubmissions(all, { assignmentId, search, stage }), [all, assignmentId, search, stage]);
  const selected = all.find((item) => item.id === submissionId);
  const forbidden = submissions.error instanceof ApiError && submissions.error.status === 403;
  const classroom = classrooms.data?.find((room) => room.id === classroomId);

  /* ---- detail (master/detail): no grading field exists until a submission is selected ---- */
  if (submissionId && classroomId) {
    return (
      <main className="mx-auto w-full max-w-[1240px] px-4 py-6 md:px-8 md:py-8">
        <button type="button" onClick={() => update({ submissionId: '' })} className="inline-flex items-center gap-1 text-[13px] text-ink-muted hover:text-ink"><ChevronLeftIcon className="h-4 w-4" aria-hidden />Back to submissions</button>
        <h1 className="mt-3 text-[26px] font-semibold leading-tight tracking-[-0.015em] text-ink">Review submission</h1>
        <p className="mb-5 mt-1.5 text-[15px] text-ink-muted">{selected ? `${selected.full_name ?? 'Student'} · ${selected.assignment_title ?? ''}${selected.attempt_number ? ` · Attempt ${selected.attempt_number}` : ''}` : classroom?.name}</p>
        <SubmissionReviewDetail key={submissionId} submissionId={submissionId} token={token} classroomId={classroomId} allSubmissions={all} onSelect={(id) => update({ submissionId: id })} />
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-[1240px] px-4 py-6 md:px-8 md:py-8">
      <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.015em] text-ink">Submissions</h1>
      <p className="mt-1.5 text-[15px] text-ink-muted">Review submitted Blockly programs, score them with the rubric, and release grades when you are ready.</p>

      <div className="mt-6 flex flex-wrap items-end gap-3">
        <label className="text-[13px] font-medium text-ink">Classroom
          <select className={`${selectClass} mt-1 min-w-[220px]`} value={classroomId} onChange={(event) => { setStage('all'); update({ classroomId: event.target.value, assignmentId: '', submissionId: '' }); }}>
            <option value="">Select a classroom</option>{(classrooms.data ?? []).map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}</select></label>
        <label className="text-[13px] font-medium text-ink">Assignment
          <select className={`${selectClass} mt-1 min-w-[240px]`} disabled={!classroomId} value={assignmentId} onChange={(event) => update({ assignmentId: event.target.value })}>
            <option value="">All assignments</option>{publishedAssignments.map((item) => <option key={item.assignment_id} value={item.assignment_id}>{item.title}</option>)}</select></label>
        <div className="relative min-w-[220px] flex-1 sm:max-w-[320px]"><SearchIcon className="pointer-events-none absolute left-3 top-[34px] h-4 w-4 text-ink-subtle" aria-hidden />
          <label className="text-[13px] font-medium text-ink">Student<input type="search" disabled={!classroomId} placeholder="Search by name or email" value={searchText} onChange={(event) => setSearchText(event.target.value)} className={`${inputClasses} mt-1 h-9 pl-9`} /></label></div>
      </div>

      {classrooms.isLoading && <p role="status" className="mt-8 text-sm text-ink-muted">Loading classrooms…</p>}
      {classrooms.error && <p role="alert" className="mt-6 border-l-4 border-danger bg-danger-soft p-3 text-sm text-danger">{classrooms.error instanceof Error ? classrooms.error.message : 'Classrooms could not be loaded.'} <button type="button" className="ml-2 font-semibold underline" onClick={() => void classrooms.refetch()}>Retry</button></p>}
      {classrooms.isSuccess && !classrooms.data.length && <EmptyState className="mt-6 rounded-lg border border-line bg-surface" icon={<UsersIcon />} title="No classrooms to review" description="You are not assigned to teach any classroom yet, so there are no submissions you can see." />}
      {classrooms.isSuccess && classrooms.data.length > 0 && !classroomId && <EmptyState className="mt-6 rounded-lg border border-line bg-surface" icon={<InboxIcon />} title="Select a classroom" description="Choose a classroom to see the submissions awaiting your review." />}

      {classroomId && (
        <>
          {forbidden && <EmptyState className="mt-6 rounded-lg border border-line bg-surface" icon={<LockIcon />} title="You can’t review this classroom" description="Your role does not include reviewing submissions here. Ask a school administrator if you need access." />}
          {submissions.error && !forbidden && <p role="alert" className="mt-6 border-l-4 border-danger bg-danger-soft p-3 text-sm text-danger">{submissions.error instanceof Error ? submissions.error.message : 'Submissions could not be loaded.'} <button type="button" className="ml-2 font-semibold underline" onClick={() => void submissions.refetch()}>Retry</button></p>}

          {!submissions.error && (
            <>
              <section aria-label="Submission summary" className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Stat label="Total submitted" value={summary.total} active={stage === 'all'} onClick={() => setStage('all')} />
                <Stat label="Awaiting assessment" value={summary.awaiting} active={stage === 'awaiting'} onClick={() => setStage('awaiting')} />
                <Stat label="Assessed" value={summary.assessed} active={stage === 'assessed'} onClick={() => setStage('assessed')} />
                <Stat label="Released" value={summary.released} active={stage === 'released'} onClick={() => setStage('released')} />
              </section>

              <section aria-label="Submissions" className="mt-5 rounded-lg border border-line bg-surface">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
                  <h2 className="text-base font-semibold text-ink">{classroom?.name ?? 'Submissions'}</h2>
                  <div role="group" aria-label="Filter by status" className="flex flex-wrap gap-1">{stageFilters.map((entry) => <button key={entry.value} type="button" aria-pressed={stage === entry.value} onClick={() => setStage(entry.value)} className={`rounded-md px-2.5 py-1 text-[13px] ${stage === entry.value ? 'bg-accent-soft font-medium text-accent-ink' : 'text-ink-muted hover:bg-sunken'}`}>{entry.label}</button>)}</div>
                </div>
                {submissions.isLoading && <div role="status" aria-busy="true" className="space-y-2 p-4"><div className="h-10 animate-pulse rounded bg-sunken" /><div className="h-10 animate-pulse rounded bg-sunken" /><div className="h-10 animate-pulse rounded bg-sunken" /><span className="sr-only">Loading submissions…</span></div>}
                {!submissions.isLoading && !publishedAssignments.length && !assignments.isLoading && <EmptyState compact icon={<InboxIcon />} title="No published assignments" description="Publish an assignment to this classroom before students can submit work." />}
                {!submissions.isLoading && publishedAssignments.length > 0 && !all.length && <EmptyState compact icon={<InboxIcon />} title="No submissions yet" description="Students’ final submissions appear here. Drafts and simulation runs are never listed." />}
                {!submissions.isLoading && all.length > 0 && !visible.length && <EmptyState compact icon={<SearchIcon />} title="No submissions match" description="Try another assignment, status or student." action={<Button variant="secondary" onClick={() => { setStage('all'); setSearchText(''); update({ assignmentId: '' }); }}>Clear filters</Button>} />}
                {visible.length > 0 && (
                  <div className="relative overflow-x-auto">
                    <table className="w-full min-w-[760px] text-left text-sm">
                      <thead className="bg-sunken/60 text-xs uppercase tracking-wide text-ink-muted"><tr><th scope="col" className="px-4 py-3 font-medium">Student</th><th scope="col" className="px-3 py-3 font-medium">Assignment</th><th scope="col" className="px-3 py-3 font-medium">Attempt</th><th scope="col" className="px-3 py-3 font-medium">Submitted</th><th scope="col" className="px-3 py-3 font-medium">Status</th><th scope="col" className="px-4 py-3 text-right font-medium"><span className="sr-only">Review</span></th></tr></thead>
                      <tbody className="divide-y divide-line">{visible.map((item) => { const itemStage = submissionStage(item); return (
                        <tr key={item.id} className="hover:bg-sunken/40">
                          <td className="px-4 py-3"><p className="font-medium text-ink">{item.full_name ?? 'Student'}</p>{item.email && <p className="text-xs text-ink-subtle">{item.email}</p>}</td>
                          <td className="px-3 py-3 text-ink-muted">{item.assignment_title ?? '—'}</td>
                          <td className="px-3 py-3 tabular-nums text-ink-muted">{item.attempt_number ? `Attempt ${item.attempt_number}` : '—'}</td>
                          <td className="whitespace-nowrap px-3 py-3 text-ink-muted">{formatDateTime(item.submitted_at)}</td>
                          <td className="px-3 py-3"><Badge tone={tone(itemStage)} dot>{stageLabel[itemStage]}</Badge></td>
                          <td className="px-4 py-3 text-right"><Button size="sm" variant={itemStage === 'awaiting' ? 'primary' : 'secondary'} aria-label={`Review ${item.full_name ?? 'student'} attempt ${item.attempt_number ?? ''}`} onClick={() => update({ submissionId: item.id })}>Review</Button></td>
                        </tr>); })}</tbody>
                    </table>
                  </div>
                )}
                {visible.length > 0 && <p className="border-t border-line px-4 py-3 text-xs text-ink-subtle">No submission selected. Press Review to open the submitted program and the grading panel.</p>}
              </section>
            </>
          )}
        </>
      )}
    </main>
  );
}
