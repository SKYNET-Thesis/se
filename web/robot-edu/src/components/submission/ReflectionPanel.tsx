import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { reflectionApi } from '../../lib/api';
import { Button } from '../ui/Button';

export const REFLECTION_PROMPT_KEY = 'post_assessment';
export const REFLECTION_PROMPT = 'What did you learn from your instructor’s feedback, and what would you change next time?';
const MAX_LENGTH = 5000;
const keys = { list: (submissionId: string) => ['student-learning', 'reflections', submissionId] as const };

/**
 * The learner's reflection on ONE assessed submission (SRS WF-04). It opens once the instructor's feedback has been released to the
 * learner; the server independently refuses a reflection on an unassessed submission. Saved reflections stay readable.
 */
export function ReflectionPanel({ submissionId, token, unlocked }: { submissionId: string; token: string; unlocked: boolean }) {
  const client = useQueryClient();
  const [text, setText] = useState('');
  const inFlight = useRef(false);   // two submits in the same tick must send one request
  const saved = useQuery({ queryKey: keys.list(submissionId), queryFn: () => reflectionApi.list(submissionId, token), enabled: Boolean(token && submissionId) });
  const save = useMutation({
    mutationFn: () => reflectionApi.create(submissionId, token, { promptKey: REFLECTION_PROMPT_KEY, promptText: REFLECTION_PROMPT, responseText: text.trim() }),
    onSuccess: async () => { setText(''); await client.invalidateQueries({ queryKey: keys.list(submissionId) }); },
  });
  const mine = saved.data ?? [];
  const blank = text.trim().length === 0;

  return <section aria-label="Your reflection" className="mt-6 rounded-md border border-line p-5">
    <h3 className="text-base font-semibold text-ink">Your reflection</h3>
    {saved.error && <p role="alert" className="mt-2 text-sm text-danger">Your saved reflections could not be loaded.</p>}
    {mine.length > 0 && <ul className="mt-3 space-y-3">{mine.map((item) => <li key={item.id} className="rounded-md bg-sunken/50 p-3 text-sm">
      <p className="text-xs text-ink-subtle">{new Date(item.created_at).toLocaleString()}</p>
      <p className="mt-1 whitespace-pre-wrap text-ink">{item.response_text}</p>
    </li>)}</ul>}
    {!unlocked
      ? <p className="mt-2 text-sm text-ink-muted">You can reflect once your instructor has released feedback on this attempt.</p>
      : <form className="mt-3 space-y-3" onSubmit={(event) => { event.preventDefault(); if (blank || save.isPending || inFlight.current) return; inFlight.current = true; save.mutate(undefined, { onSettled: () => { inFlight.current = false; } }); }}>
        <label className="block text-sm font-medium text-ink">{REFLECTION_PROMPT}
          <textarea className="mt-2 block min-h-24 w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink" maxLength={MAX_LENGTH} value={text} onChange={(event) => setText(event.target.value)} disabled={save.isPending} />
        </label>
        {save.error && <p role="alert" className="text-sm text-danger">{save.error instanceof Error ? save.error.message : 'Your reflection could not be saved.'}</p>}
        <Button type="submit" variant="primary" disabled={blank || save.isPending} loading={save.isPending}>Save reflection</Button>
      </form>}
  </section>;
}
