import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardCheckIcon, PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { toast } from 'sonner';
import type { Assignment } from '../../types/learning';
import { useLearning } from '../../contexts/LearningContext';
import { PageHeader } from '../../components/ui/PageHeader';
import { DemoTag } from '../../components/ui/DemoTag';
import { LinkButton } from '../../components/ui/LinkButton';
import { IconButton } from '../../components/ui/IconButton';
import { Badge } from '../../components/ui/Badge';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { EmptyState } from '../../components/ui/EmptyState';
import { describeDue } from '../../utils/format';

export function TeacherAssignments() {
  const { assignments, getCourse, submissions, deleteAssignment } = useLearning();
  const [toDelete, setToDelete] = useState<Assignment | null>(null);
  const sorted = [...assignments].sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  return (
    <div className="mx-auto w-full max-w-[1180px] px-4 py-6 md:px-8 md:py-9">
      <PageHeader
        eyebrow={<DemoTag label="Saved in this browser" />}
        title="Assignments"
        description="Create programming tasks with automatic checks the Studio evaluates live."
        actions={
        <LinkButton to="/teacher/assignments/new" variant="primary" icon={<PlusIcon className="h-4 w-4" />}>
            New assignment
          </LinkButton>
        } />
      
      {sorted.length === 0 ?
      <EmptyState icon={<ClipboardCheckIcon />} title="No assignments yet" action={<LinkButton to="/teacher/assignments/new">Create assignment</LinkButton>} /> :

      <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs text-ink-subtle">
                <th className="py-2 pr-4 font-medium">Assignment</th>
                <th className="py-2 pr-4 font-medium">Course</th>
                <th className="py-2 pr-4 font-medium">Due</th>
                <th className="py-2 pr-4 text-right font-medium">Criteria</th>
                <th className="py-2 pr-4 text-right font-medium">Submissions</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2" aria-label="Actions" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {sorted.map((a) => {
              const subs = submissions.filter((s) => s.assignmentId === a.id);
              const pending = subs.filter((s) => !s.review).length;
              return (
                <tr key={a.id}>
                    <td className="py-3 pr-4">
                      <Link to={`/teacher/assignments/${a.id}/edit`} className="font-medium text-ink hover:text-accent">
                        {a.title}
                      </Link>
                      <p className="text-xs text-ink-subtle">{a.points} pts</p>
                    </td>
                    <td className="py-3 pr-4 text-ink-muted">{getCourse(a.courseId)?.code ?? '—'}</td>
                    <td className="py-3 pr-4 text-ink-muted">{describeDue(a.dueDate).label}</td>
                    <td className="tabular py-3 pr-4 text-right text-ink-muted">{a.criteria.length}</td>
                    <td className="tabular py-3 pr-4 text-right">
                      <Link to="/teacher/submissions" className="text-ink-muted hover:text-accent">
                        {subs.length}
                        {pending > 0 && <span className="ml-1 text-warn">({pending} to review)</span>}
                      </Link>
                    </td>
                    <td className="py-3 pr-4">
                      <Badge tone={a.published ? 'ok' : 'outline'}>{a.published ? 'Published' : 'Draft'}</Badge>
                    </td>
                    <td className="py-3 text-right">
                      <div className="inline-flex">
                        <Link to={`/teacher/assignments/${a.id}/edit`} aria-label={`Edit ${a.title}`} title="Edit" className="inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-muted hover:bg-sunken hover:text-ink">
                          <PencilIcon className="h-3.5 w-3.5" />
                        </Link>
                        <IconButton label={`Delete ${a.title}`} size="sm" className="hover:bg-danger-soft hover:text-danger" onClick={() => setToDelete(a)}>
                          <Trash2Icon />
                        </IconButton>
                      </div>
                    </td>
                  </tr>);

            })}
            </tbody>
          </table>
        </div>
      }
      <ConfirmDialog
        open={toDelete !== null}
        title={`Delete “${toDelete?.title}”?`}
        description="Students will no longer see this assignment. Existing demo submissions remain listed."
        confirmLabel="Delete assignment"
        onCancel={() => setToDelete(null)}
        onConfirm={() => {
          if (toDelete) deleteAssignment(toDelete.id);
          setToDelete(null);
          toast.success('Assignment deleted');
        }} />
      
    </div>);

}