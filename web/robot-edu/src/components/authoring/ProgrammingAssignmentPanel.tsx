import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '../ui/Button';
import { curriculumApi } from '../../lib/api';

/** The blocks the programming validator accepts (the backend rejects anything else). */
export const PROGRAMMING_BLOCKS: Array<{ id: string; label: string }> = [
  { id: 'arm.select', label: 'Select arm' },
  { id: 'home', label: 'Move to home' },
  { id: 'preview.move_xyz', label: 'Move to X / Y / Z' },
  { id: 'wait', label: 'Wait' },
  { id: 'gripper.open', label: 'Open gripper' },
  { id: 'gripper.close', label: 'Close gripper' },
];

type Props = {
  activityId: string;
  token: string;
  /** Used as the default assignment title for a new assignment. */
  activityTitle: string;
  readOnly?: boolean;
  /** Called with the assignment id once the template is created and linked, so the activity draft keeps the link. */
  onLinked: (assignmentId: string) => void;
  onDirtyChange?: (dirty: boolean) => void;
};
const field = 'mt-1 w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink';

/** Create, edit, link and preview the programming assignment of a Programming Assignment activity. */
export function ProgrammingAssignmentPanel({ activityId, token, activityTitle, readOnly = false, onLinked, onDirtyChange }: Props) {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ['programming-assignment', activityId], queryFn: () => curriculumApi.programmingAssignment(activityId, token) });
  const saved = query.data ?? null;
  const [title, setTitle] = useState('');
  const [instructions, setInstructions] = useState('');
  const [blocks, setBlocks] = useState<string[]>([]);
  const [touched, setTouched] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);
  // A template created in another way (not by this editor) is kept as is: the server refuses to rewrite it.
  const foreign = Boolean(saved && saved.kind !== 'symbolic_program');
  const locked = readOnly || foreign;

  useEffect(() => {
    if (touched || query.isLoading) return;
    setTitle(saved?.title ?? activityTitle);
    setInstructions(saved?.instructions ?? '');
    setBlocks(saved?.allowedBlocks ?? []);
  }, [saved, query.isLoading, touched, activityTitle]);
  useEffect(() => { onDirtyChange?.(touched); }, [touched, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  const save = useMutation({
    mutationFn: () => {
      if (!title.trim()) throw new Error('Assignment title is required.');
      if (!blocks.length) throw new Error('Choose at least one block students may use.');
      return curriculumApi.saveProgrammingAssignment(activityId, token, { title: title.trim(), instructions: instructions.trim(), allowedBlocks: blocks });
    },
    onSuccess: async (result) => {
      onLinked(result.id);
      setTouched(false);
      setClientError(null);
      qc.setQueryData(['programming-assignment', activityId], result);
      // the outline/activity cache holds the new content reference; wait for it so the draft never re-syncs from a stale one
      await qc.invalidateQueries({ queryKey: ['curriculum'] });
    },
  });
  const toggle = (id: string) => { setTouched(true); setBlocks((current) => (current.includes(id) ? current.filter((b) => b !== id) : [...current, id])); };
  const error = clientError ?? (save.error as Error | null)?.message ?? (query.error as Error | null)?.message ?? null;

  return (
    <div className="space-y-4" data-testid="programming-assignment-panel">
      {readOnly && <p role="status" className="rounded-md border border-line bg-sunken px-3 py-2 text-sm text-ink-muted">This course is archived. The assignment is read-only.</p>}
      {foreign && <p role="status" className="rounded-md border border-line bg-sunken px-3 py-2 text-sm text-ink-muted">This activity is linked to an assignment that was not created in Course Builder, so it is shown read-only and kept as is.</p>}
      {query.isLoading ? <p className="text-sm text-ink-muted">Loading assignment…</p> : (
        <>
          <label className="block text-sm font-medium text-ink">
            Assignment title
            <input className={field} disabled={locked} maxLength={200} value={title} onChange={(e) => { setTouched(true); setTitle(e.target.value); }} />
          </label>
          <label className="block text-sm font-medium text-ink">
            Task instructions
            <textarea className={field} disabled={locked} rows={4} maxLength={10000} value={instructions} onChange={(e) => { setTouched(true); setInstructions(e.target.value); }} placeholder="What should the student program the robot to do?" />
          </label>
          <fieldset disabled={locked}>
            <legend className="text-sm font-medium text-ink">Blocks students may use</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {PROGRAMMING_BLOCKS.map((block) => (
                <label key={block.id} className="flex items-center gap-2 rounded-md border border-line px-3 py-2 text-sm text-ink">
                  <input type="checkbox" checked={blocks.includes(block.id)} onChange={() => toggle(block.id)} />
                  {block.label}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-ink-muted">
              {saved ? `Linked to this activity · ${saved.allowedBlocks.length} blocks${touched ? ' · unsaved edits' : ''}` : 'Not created yet. Saving creates the assignment and links it to this activity.'}
            </p>
            {!locked && (
              <Button variant="primary" loading={save.isPending} disabled={save.isPending || (Boolean(saved) && !touched)} onClick={() => { setClientError(null); save.mutate(); }}>
                {saved ? 'Save programming assignment' : 'Create programming assignment'}
              </Button>
            )}
          </div>
          {error && <p role="alert" className="rounded-md bg-danger-soft p-3 text-sm text-danger">{error}</p>}
          <section aria-label="Student view" className="rounded-md border border-line bg-sunken/40 p-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-ink-subtle">Student view</h4>
            <p className="mt-2 font-semibold text-ink">{title.trim() || 'Untitled assignment'}</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-ink-muted">{instructions.trim() || 'No instructions yet.'}</p>
            <p className="mt-2 text-xs text-ink-muted">Available blocks: {blocks.length ? PROGRAMMING_BLOCKS.filter((b) => blocks.includes(b.id)).map((b) => b.label).join(', ') : 'none selected'}</p>
          </section>
        </>
      )}
    </div>
  );
}
