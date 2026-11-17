import { useEffect, useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { catalogApi, curriculumApi } from '../../lib/api';
import { AddContentMenu } from './AddContentMenu';

type Common = {
  token: string;
  disabled?: boolean;
  /** Reports whether the form holds edits that are not saved yet (feeds the editor's unsaved-changes guard). */
  onDirtyChange: (dirty: boolean) => void;
  /** Called after the API accepted the change so the outline can refresh. */
  onSaved: () => Promise<unknown> | void;
};

export type CurriculumItemEditorProps =
  | (Common & {
      kind: 'module';
      id: string;
      title: string;
      content?: Record<string, unknown>;
      lessonCount: number;
      onAddLesson: () => void;
      /** Modules that come before this one: candidates for its unlock rule. */
      earlierModules?: Array<{ id: string; title: string }>;
      prerequisiteLessonIds?: string[];
    })
  | (Common & {
      kind: 'lesson';
      id: string;
      title: string;
      status?: 'draft' | 'published';
      activityCount: number;
      onAddActivity: (type: string) => void;
    });

const fieldClass =
  'mt-1.5 block w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:opacity-60';

/** Information editor for a Module (database lesson) or a Lesson (database section). Mount it with `key={id}`. */
export function CurriculumItemEditor(props: CurriculumItemEditorProps) {
  const { token, disabled = false, onDirtyChange, onSaved } = props;
  const savedTitle = props.title;
  const savedSummary = props.kind === 'module' && typeof props.content?.summary === 'string' ? props.content.summary : '';
  const [title, setTitle] = useState(savedTitle);
  const [summary, setSummary] = useState(savedSummary);
  const [baseline, setBaseline] = useState({ title: savedTitle, summary: savedSummary });
  const [touched, setTouched] = useState(false);
  const savedPrereqs = props.kind === 'module' ? [...(props.prerequisiteLessonIds ?? [])].sort() : [];
  const [prereqs, setPrereqs] = useState<string[]>(savedPrereqs);
  const [prereqBaseline, setPrereqBaseline] = useState<string[]>(savedPrereqs);

  const prereqDirty = [...prereqs].sort().join() !== prereqBaseline.join();
  const dirty = title !== baseline.title || summary !== baseline.summary || prereqDirty;
  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

  const save = useMutation({
    mutationFn: async () => {
      const nextTitle = title.trim();
      if (props.kind === 'module') {
        if (title !== baseline.title || summary !== baseline.summary) await catalogApi.updateLesson(props.id, token, { title: nextTitle, content: { ...(props.content ?? {}), summary: summary.trim() } });
        if (prereqDirty) await catalogApi.setLessonPrerequisites(props.id, token, prereqs);
        return;
      }
      return curriculumApi.updateSection(props.id, token, { title: nextTitle });
    },
    onSuccess: async () => {
      await onSaved();
      setBaseline({ title: title.trim(), summary: summary.trim() });
      setPrereqBaseline([...prereqs].sort());
      setTitle((t) => t.trim());
      setSummary((v) => v.trim());
    },
  });

  const titleError = touched && !title.trim() ? 'A title is required.' : null;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (!title.trim() || save.isPending || !dirty) return;
    save.mutate();
  };
  const noun = props.kind === 'module' ? 'Module' : 'Lesson';

  return (
    <form onSubmit={submit} className="space-y-5 rounded-xl border border-line bg-surface p-5 shadow-hairline sm:p-6" aria-label={`${noun} information`} data-testid={`${props.kind}-info-editor`}>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-accent-ink">{noun} information</span>
          <h2 className="mt-0.5 text-xl font-bold tracking-tight text-ink">{props.title || `Untitled ${noun.toLowerCase()}`}</h2>
        </div>
        <div className="flex items-center gap-2">
          {props.kind === 'lesson' && <Badge tone={props.status === 'published' ? 'ok' : 'neutral'}>{props.status ?? 'draft'}</Badge>}
          <span role="status" className="text-xs text-ink-muted">{save.isPending ? 'Saving…' : dirty ? 'Unsaved changes' : 'Saved'}</span>
        </div>
      </header>

      <label className="block text-sm font-medium text-ink">
        {noun} title
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => setTouched(true)}
          disabled={disabled}
          maxLength={240}
          aria-invalid={titleError ? true : undefined}
          className={fieldClass}
        />
        {titleError && <span role="alert" className="mt-1 block text-xs text-danger">{titleError}</span>}
      </label>

      {props.kind === 'module' && (
        <label className="block text-sm font-medium text-ink">
          Module summary
          <textarea value={summary} onChange={(e) => setSummary(e.target.value)} disabled={disabled} rows={4} className={fieldClass} placeholder="What will learners accomplish in this module?" />
        </label>
      )}

      {props.kind === 'module' && (
        <fieldset className="rounded-md border border-line p-3" disabled={disabled}>
          <legend className="px-1 text-sm font-medium text-ink">Unlock rule</legend>
          {(props.earlierModules ?? []).length === 0
            ? <p className="text-xs text-ink-muted">This is the first module, so it is always open to enrolled learners. Later modules can require earlier ones to be completed first.</p>
            : <>
                <p className="text-xs text-ink-muted">Learners must complete the selected modules before this one unlocks. Leave all unchecked to keep it open from the start.</p>
                <ul className="mt-2 space-y-1.5">{props.earlierModules!.map((m) => <li key={m.id}><label className="flex items-center gap-2 text-sm text-ink"><input type="checkbox" checked={prereqs.includes(m.id)} onChange={(e) => setPrereqs((cur) => (e.target.checked ? [...cur, m.id] : cur.filter((id) => id !== m.id)))} />Complete “{m.title}” first</label></li>)}</ul>
              </>}
        </fieldset>
      )}

      {save.isError && (
        <p role="alert" className="rounded-md bg-danger-soft p-3 text-sm text-danger">
          {save.error instanceof Error && save.error.message ? save.error.message : `Could not save the ${noun.toLowerCase()}.`}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
        <div className="flex items-center gap-2 text-xs text-ink-muted">
          {props.kind === 'module' ? (
            <>
              <span>{props.lessonCount} lesson{props.lessonCount === 1 ? '' : 's'}</span>
              <Button type="button" size="sm" variant="secondary" disabled={disabled} onClick={props.onAddLesson}>Add lesson</Button>
            </>
          ) : (
            <>
              <span>{props.activityCount} activit{props.activityCount === 1 ? 'y' : 'ies'}</span>
              <AddContentMenu disabled={disabled} onSelectType={props.onAddActivity} />
            </>
          )}
        </div>
        <Button type="submit" variant="primary" loading={save.isPending} disabled={disabled || save.isPending || !dirty}>
          Save {noun.toLowerCase()}
        </Button>
      </div>
    </form>
  );
}
