import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardCheckIcon, PencilIcon, PlusIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import { LinkButton } from '../../components/ui/LinkButton';
import { PageHeader } from '../../components/ui/PageHeader';
import { useSupabaseSession } from '../../contexts/SupabaseSessionContext';
import { assignmentApi, instructorApi } from '../../lib/api';
import { assignmentStatusLabel, canPublishAssignment, flattenTeacherAssignments, teacherAssignmentEditPath, teacherLearningInvalidations, teacherLearningKeys, type TeacherAssignmentRow } from '../../queries/teacherLearningQueries';

export function TeacherAssignments() {
  const { session } = useSupabaseSession();
  const token = session?.access_token ?? '';
  const queryClient = useQueryClient();
  const classrooms = useQuery({ queryKey: teacherLearningKeys.teachingClassrooms, queryFn: () => instructorApi.teachingClassrooms(token), enabled: Boolean(token) });
  const classroomAssignments = useQueries({ queries: (classrooms.data ?? []).map((classroom) => ({ queryKey: teacherLearningKeys.assignments(classroom.id), queryFn: () => assignmentApi.list(classroom.id, token), enabled: Boolean(token) })) });
  const rows = flattenTeacherAssignments((classrooms.data ?? []).map((classroom, index) => ({ classroom, assignments: classroomAssignments[index]?.data ?? [] })));
  const publish = useMutation({
    mutationFn: (assignment: TeacherAssignmentRow) => assignmentApi.publish(assignment.classroomId, assignment.assignment_id, token),
    onSuccess: async (_result, assignment) => { await Promise.all(teacherLearningInvalidations(assignment.classroomId).map((queryKey) => queryClient.invalidateQueries({ queryKey }))); },
  });
  const loading = classrooms.isLoading || classroomAssignments.some((query) => query.isLoading);
  const error = classrooms.error ?? classroomAssignments.find((query) => query.error)?.error ?? publish.error;

  return <main className="mx-auto w-full max-w-[1180px] px-4 py-6 md:px-8 md:py-9">
    <PageHeader eyebrow={<span className="text-xs font-semibold uppercase tracking-[.16em] text-[#176255]">Classroom learning</span>} title="Assignments" description="Create persistent classroom drafts, then publish them when they are ready for students." actions={<LinkButton to="/teacher/assignments/new" variant="primary" icon={<PlusIcon className="h-4 w-4" />}>New assignment</LinkButton>} />
    {error && <p role="alert" className="mt-6 border-l-4 border-red-600 bg-red-50 p-3 text-sm text-red-800">{error instanceof Error ? error.message : 'Assignments could not be loaded.'}</p>}
    {loading && <p className="mt-6 text-sm text-ink-muted">Loading assignments from Education API…</p>}
    {!loading && !error && rows.length === 0 && <EmptyState icon={<ClipboardCheckIcon />} title="No assignments yet" description="Create a draft for one of your teaching classrooms." action={<LinkButton to="/teacher/assignments/new">Create assignment</LinkButton>} />}
    {!loading && rows.length > 0 && <div className="mt-6 overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm">
      <thead><tr className="border-b border-line text-xs text-ink-subtle"><th className="py-2 pr-4 font-medium">Assignment</th><th className="py-2 pr-4 font-medium">Classroom</th><th className="py-2 pr-4 font-medium">Lesson</th><th className="py-2 pr-4 font-medium">Status</th><th className="py-2 text-right font-medium">Actions</th></tr></thead>
      <tbody className="divide-y divide-line">{rows.map((assignment) => <tr key={assignment.id}>
        <td className="py-4 pr-4"><p className="font-medium text-ink">{assignment.title}</p>{assignment.challenge_title && <p className="mt-1 text-xs text-ink-subtle">{assignment.challenge_title}</p>}</td>
        <td className="py-4 pr-4 text-ink-muted">{assignment.classroomName}</td><td className="py-4 pr-4 text-ink-muted">{assignment.lesson_title ?? '—'}</td>
        <td className="py-4 pr-4"><Badge tone={assignment.status === 'published' ? 'ok' : 'outline'}>{assignmentStatusLabel(assignment.status)}</Badge></td>
        <td className="py-4 text-right"><div className="inline-flex items-center gap-3"><Link className="inline-flex items-center gap-1 text-sm font-semibold text-[#176255] underline underline-offset-4" to={teacherAssignmentEditPath(assignment.classroomId, assignment.assignment_id)}><PencilIcon className="h-3.5 w-3.5" />Edit</Link>{canPublishAssignment(assignment.status) && <button type="button" disabled={publish.isPending} onClick={() => publish.mutate(assignment)} className="h-9 bg-[#176255] px-3 text-sm font-semibold text-white disabled:opacity-50">Publish</button>}</div></td>
      </tr>)}</tbody>
    </table></div>}
  </main>;
}
