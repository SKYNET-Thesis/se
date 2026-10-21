import React from 'react';
import { Link } from 'react-router-dom';
import { PuzzleIcon } from 'lucide-react';
import { usePrograms } from '../../contexts/ProgramsContext';
import { useLearning } from '../../contexts/LearningContext';
import { EmptyState } from '../ui/EmptyState';
import { LinkButton } from '../ui/LinkButton';
import { SectionHeading } from '../ui/SectionHeading';
import { formatRelative } from '../../utils/format';

export function RecentPrograms() {
  const { programs } = usePrograms();
  const { getAssignment } = useLearning();
  const recent = [...programs].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 4);

  return (
    <section aria-labelledby="programs-heading">
      <SectionHeading
        id="programs-heading"
        title="Recent programs"
        action={
        <Link to="/studio" className="font-medium text-accent hover:text-accent-hover">
            Studio
          </Link>
        } />
      
      {recent.length === 0 ?
      <EmptyState compact icon={<PuzzleIcon />} title="No programs yet" action={<LinkButton to="/studio" size="sm">Create one</LinkButton>} /> :

      <ul className="divide-y divide-line border-y border-line">
          {recent.map((p) =>
        <li key={p.id}>
              <Link to={`/studio/${p.id}`} className="-mx-2 flex items-center gap-3 rounded-md px-2 py-3 hover:bg-sunken/70">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent-ink">
                  <PuzzleIcon className="h-4 w-4" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink">{p.name}</span>
                  <span className="block truncate text-xs text-ink-subtle">{p.assignmentId ? getAssignment(p.assignmentId)?.title ?? 'Assignment' : 'Free practice'}</span>
                </span>
                <span className="shrink-0 text-xs text-ink-subtle">{formatRelative(p.updatedAt)}</span>
              </Link>
            </li>
        )}
        </ul>
      }
    </section>);

}