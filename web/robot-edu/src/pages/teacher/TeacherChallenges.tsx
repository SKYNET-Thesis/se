import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PlusIcon, PuzzleIcon, Trash2Icon } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { Field, inputClasses } from '../../components/ui/Field';
import { PageHeader } from '../../components/ui/PageHeader';
import { useSupabaseSession } from '../../contexts/SupabaseSessionContext';
import { challengeAuthoringApi, type ApiChallengeRule } from '../../lib/api';

const BLOCKS: Array<[string, string]> = [['arm.select', 'Select arm'], ['gripper.open', 'Open gripper'], ['gripper.close', 'Close gripper'], ['home', 'Go home'], ['wait', 'Wait'], ['preview.move_xyz', 'Move to point (preview)']];
const blockLabel = (id: string) => BLOCKS.find(([key]) => key === id)?.[1] ?? id;
const RULES: Array<[string, string]> = [['ordered_actions', 'Actions happen in this order'], ['action_present', 'An action is used'], ['action_absent', 'An action is not used'], ['action_count', 'An action is used N times'], ['arm_selected', 'An arm is selected'], ['final_gripper_state', 'The gripper finishes open/closed'], ['home_action_present', 'The arm goes home'], ['symbolic_duration', 'Total wait time'], ['preview_target_match', 'The arm reaches a target point'], ['object_grasped', 'The object is grasped'], ['object_lifted', 'The object is lifted'], ['object_released', 'The object is released'], ['object_in_target_zone', 'The object ends in the target zone']];
const DEFAULT_CONFIG: Record<string, Record<string, unknown>> = {
  ordered_actions: { actions: ['gripper.open', 'gripper.close'] }, action_present: { action: 'gripper.open' }, action_absent: { action: 'home' },
  action_count: { action: 'wait', comparator: 'gte', count: 1 }, arm_selected: { arm: 'left' }, final_gripper_state: { arm: 'left', state: 'closed' }, home_action_present: { arm: 'left' },
  symbolic_duration: { comparator: 'gte', durationMs: 1000 }, preview_target_match: { frame: 'learning_preview_v1', arm: 'left', position: { x: 240, y: 220, z: 120 } },
  object_grasped: {}, object_lifted: {}, object_released: {}, object_in_target_zone: {},
};
const key = ['teacher', 'challenges'] as const;
const msg = (error: unknown) => (error instanceof Error ? error.message : 'The request failed.');

/** Instructor: author Blockly challenges (toolbox + automatically graded success rules), then use them in a lab assignment. */
export function TeacherChallenges() {
  const { session } = useSupabaseSession(); const token = session?.access_token ?? ''; const queryClient = useQueryClient();
  const [editing, setEditing] = useState<string | 'new' | null>(null); const [error, setError] = useState('');
  const list = useQuery({ queryKey: key, queryFn: () => challengeAuthoringApi.list(token), enabled: Boolean(token) });
  const refresh = () => queryClient.invalidateQueries({ queryKey: key });
  const publish = useMutation({ mutationFn: (id: string) => challengeAuthoringApi.publish(id, token), onSuccess: () => { setError(''); void refresh(); }, onError: (e) => setError(msg(e)) });
  const unpublish = useMutation({ mutationFn: (id: string) => challengeAuthoringApi.unpublish(id, token), onSuccess: () => { setError(''); void refresh(); }, onError: (e) => setError(msg(e)) });
  const remove = useMutation({ mutationFn: (id: string) => challengeAuthoringApi.remove(id, token), onSuccess: () => { setError(''); void refresh(); }, onError: (e) => setError(msg(e)) });
  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 py-6 md:px-8 md:py-9">
      <PageHeader title="Blockly challenges" description="Define which blocks students may use and the rules that grade their program automatically. Publish a challenge, then pick it when you create a lab assignment."
        actions={<Button variant="primary" icon={<PlusIcon className="h-4 w-4" />} onClick={() => setEditing('new')}>New challenge</Button>} />
      {list.isLoading ? <p className="mt-6 text-sm text-ink-muted" role="status">Loading challenges…</p> : null}
      {list.isError ? <p className="mt-6 text-sm text-danger" role="alert">{msg(list.error)} <button className="underline" onClick={() => list.refetch()}>Retry</button></p> : null}
      {error ? <p className="mt-4 text-sm text-danger" role="alert">{error}</p> : null}
      {list.isSuccess && list.data.length === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed border-line p-10 text-center"><PuzzleIcon className="mx-auto h-8 w-8 text-ink-subtle" /><p className="mt-2 font-medium text-ink">No challenges yet</p><p className="text-sm text-ink-muted">Create one to build your own auto-graded Blockly lab.</p></div>) : null}
      <ul className="mt-6 space-y-3">{list.data?.map((c) => (
        <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface p-4" data-testid="challenge-row">
          <div><p className="font-medium text-ink">{c.title}</p><p className="mt-0.5 text-xs text-ink-muted"><span data-testid="challenge-status">{c.status === 'published' ? 'Published' : 'Draft'}</span> · {c.ruleCount} {c.ruleCount === 1 ? 'rule' : 'rules'} · {c.allowedBlocks.map(blockLabel).join(', ')} · used by {c.assignmentCount} {c.assignmentCount === 1 ? 'assignment' : 'assignments'}</p></div>
          <div className="flex gap-2">
            {c.assignmentCount === 0 ? <Button variant="secondary" size="sm" onClick={() => setEditing(c.id)} aria-label={`Edit ${c.title}`}>Edit</Button> : null}
            {c.status === 'published' && c.assignmentCount === 0 ? <Button variant="secondary" size="sm" disabled={unpublish.isPending} onClick={() => unpublish.mutate(c.id)} aria-label={`Unpublish ${c.title}`}>Unpublish</Button> : null}
            {c.status === 'draft' ? <Button variant="primary" size="sm" disabled={publish.isPending} onClick={() => publish.mutate(c.id)} aria-label={`Publish ${c.title}`}>Publish</Button> : null}
            {c.assignmentCount === 0 ? <Button variant="ghost" size="sm" icon={<Trash2Icon className="h-4 w-4" />} disabled={remove.isPending} onClick={() => { if (window.confirm(`Delete ${c.title}?`)) remove.mutate(c.id); }} aria-label={`Delete ${c.title}`}>Delete</Button> : null}
          </div>
        </li>))}</ul>
      {editing ? <ChallengeDialog id={editing === 'new' ? null : editing} token={token} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void refresh(); }} /> : null}
    </div>
  );
}

function ChallengeDialog({ id, token, onClose, onSaved }: { id: string | null; token: string; onClose: () => void; onSaved: () => void }) {
  const existing = useQuery({ queryKey: ['teacher', 'challenge', id], queryFn: () => challengeAuthoringApi.get(id!, token), enabled: Boolean(id) });
  if (id && existing.isLoading) return <Dialog open onClose={onClose} title="Edit challenge"><p className="text-sm text-ink-muted" role="status">Loading…</p></Dialog>;
  if (id && existing.isError) return <Dialog open onClose={onClose} title="Edit challenge"><p className="text-sm text-danger" role="alert">{msg(existing.error)}</p></Dialog>;
  return <ChallengeForm id={id} token={token} initial={existing.data} onClose={onClose} onSaved={onSaved} />;
}

function ChallengeForm({ id, token, initial, onClose, onSaved }: { id: string | null; token: string; initial?: { title: string; description: string; allowedBlocks: string[]; conditions: ApiChallengeRule[] }; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(initial?.title ?? ''); const [description, setDescription] = useState(initial?.description ?? '');
  const [blocks, setBlocks] = useState<string[]>(initial?.allowedBlocks ?? ['arm.select', 'gripper.open', 'wait', 'gripper.close']);
  const [rules, setRules] = useState<ApiChallengeRule[]>(initial?.conditions ?? [{ ruleKey: 'ordered_actions', ruleConfig: { actions: ['gripper.open', 'gripper.close'] }, description: '' }]);
  const [error, setError] = useState('');
  const save = useMutation({ mutationFn: () => { const body = { title: title.trim(), description: description.trim(), allowedBlocks: blocks, conditions: rules.map((r) => ({ ...r, description: r.description?.trim() || undefined })) }; return id ? challengeAuthoringApi.update(id, token, body) : challengeAuthoringApi.create(token, body); }, onSuccess: onSaved, onError: (e) => setError(msg(e)) });
  const setRule = (index: number, patch: Partial<ApiChallengeRule>) => setRules((all) => all.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  const setConfig = (index: number, patch: Record<string, unknown>) => setRules((all) => all.map((r, i) => {
    if (i !== index) return r;
    const next: Record<string, unknown> = { ...r.ruleConfig, ...patch };
    for (const key of Object.keys(next)) if (next[key] === undefined) delete next[key]; // an optional setting set to "any" is removed
    return { ...r, ruleConfig: next };
  }));
  const num = (value: string) => Math.max(0, Math.min(1000, Math.floor(Number(value) || 0)));
  const select = (label: string, value: string, options: Array<[string, string]>, onChange: (v: string) => void) => (
    <label className="text-xs text-ink-muted">{label}<select aria-label={label} className={`${inputClasses} mt-1`} value={value} onChange={(e) => onChange(e.target.value)}>{options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>);
  const actionOptions = BLOCKS.filter(([k]) => k !== 'arm.select' && k !== 'preview.move_xyz').concat([['arm.select', 'Select arm']]);
  const arms: Array<[string, string]> = [['left', 'Left arm'], ['right', 'Right arm']];
  const valid = title.trim().length > 0 && blocks.length > 0 && rules.length > 0;
  return (
    <Dialog open onClose={onClose} title={id ? 'Edit challenge' : 'New challenge'} size="lg"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!valid || save.isPending} onClick={() => save.mutate()}>{save.isPending ? 'Saving…' : 'Save challenge'}</Button></>}>
      <div className="space-y-5">
        <Field label="Challenge title">{(p) => <input {...p} className={inputClasses} value={title} maxLength={160} onChange={(e) => setTitle(e.target.value)} />}</Field>
        <Field label="Description">{(p) => <textarea {...p} className={inputClasses} rows={2} value={description} maxLength={2000} onChange={(e) => setDescription(e.target.value)} />}</Field>
        <fieldset><legend className="text-[13px] font-medium text-ink">Blocks students may use</legend>
          <div className="mt-2 flex flex-wrap gap-3">{BLOCKS.map(([k, l]) => (<label key={k} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={blocks.includes(k)} onChange={(e) => setBlocks((all) => (e.target.checked ? [...all, k] : all.filter((b) => b !== k)))} />{l}</label>))}</div></fieldset>
        <section aria-label="Success rules" className="space-y-3"><h3 className="text-[13px] font-medium text-ink">Success rules <span className="font-normal text-ink-muted">— all must pass for a student to succeed</span></h3>
          {rules.map((rule, index) => (
            <div key={index} className="space-y-2 rounded-md border border-line p-3" data-testid="rule-row">
              <div className="flex items-end gap-2">
                <div className="flex-1">{select(`Rule ${index + 1} type`, rule.ruleKey, RULES, (v) => setRule(index, { ruleKey: v, ruleConfig: { ...DEFAULT_CONFIG[v] } }))}</div>
                <Button variant="ghost" size="sm" disabled={rules.length === 1} onClick={() => setRules((all) => all.filter((_, i) => i !== index))} aria-label={`Remove rule ${index + 1}`}>Remove</Button>
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                {['action_present', 'action_absent', 'action_count'].includes(rule.ruleKey) ? select(`Rule ${index + 1} action`, String(rule.ruleConfig.action), actionOptions, (v) => setConfig(index, { action: v })) : null}
                {rule.ruleKey === 'action_count' ? <>{select(`Rule ${index + 1} comparison`, String(rule.ruleConfig.comparator), [['gte', 'at least'], ['eq', 'exactly'], ['lte', 'at most']], (v) => setConfig(index, { comparator: v }))}
                  <label className="text-xs text-ink-muted">Times<input aria-label={`Rule ${index + 1} count`} type="number" min={0} max={50} className={`${inputClasses} mt-1`} value={Number(rule.ruleConfig.count ?? 0)} onChange={(e) => setConfig(index, { count: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} /></label></> : null}
                {['arm_selected', 'final_gripper_state', 'home_action_present'].includes(rule.ruleKey) ? select(`Rule ${index + 1} arm`, String(rule.ruleConfig.arm), arms, (v) => setConfig(index, { arm: v })) : null}
                {rule.ruleKey === 'final_gripper_state' ? select(`Rule ${index + 1} final state`, String(rule.ruleConfig.state), [['closed', 'Closed'], ['open', 'Open']], (v) => setConfig(index, { state: v })) : null}
                {rule.ruleKey === 'symbolic_duration' ? <>{select(`Rule ${index + 1} comparison`, String(rule.ruleConfig.comparator), [['gte', 'at least'], ['eq', 'exactly'], ['lte', 'at most']], (v) => setConfig(index, { comparator: v }))}
                  <label className="text-xs text-ink-muted">Wait time (ms)<input aria-label={`Rule ${index + 1} wait time`} type="number" min={0} max={60000} className={`${inputClasses} mt-1`} value={Number(rule.ruleConfig.durationMs ?? 0)} onChange={(e) => setConfig(index, { durationMs: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} /></label></> : null}
                {rule.ruleKey === 'preview_target_match' ? <>{select(`Rule ${index + 1} target arm`, String(rule.ruleConfig.arm), arms, (v) => setConfig(index, { arm: v }))}
                  {(['x', 'y', 'z'] as const).map((axis) => (<label key={axis} className="text-xs text-ink-muted">Target {axis.toUpperCase()} (mm)<input aria-label={`Rule ${index + 1} target ${axis}`} type="number" min={0} max={1000} className={`${inputClasses} mt-1`} value={Number((rule.ruleConfig.position as Record<string, number>)[axis] ?? 0)} onChange={(e) => setConfig(index, { position: { ...(rule.ruleConfig.position as Record<string, number>), [axis]: num(e.target.value) } })} /></label>))}</> : null}
                {rule.ruleKey === 'object_grasped' ? select(`Rule ${index + 1} grasping arm`, String(rule.ruleConfig.arm ?? 'any'), [['any', 'Any arm'], ...arms], (v) => setConfig(index, { arm: v === 'any' ? undefined : v })) : null}
                {rule.ruleKey === 'object_lifted' ? <label className="text-xs text-ink-muted">Minimum lift height (mm, optional)<input aria-label={`Rule ${index + 1} minimum lift`} type="number" min={0} max={1000} className={`${inputClasses} mt-1`} value={rule.ruleConfig.minZ === undefined ? '' : Number(rule.ruleConfig.minZ)} onChange={(e) => setConfig(index, { minZ: e.target.value === '' ? undefined : num(e.target.value) })} /></label> : null}
              </div>
              {['preview_target_match', 'object_grasped', 'object_lifted', 'object_released', 'object_in_target_zone', 'symbolic_duration'].includes(rule.ruleKey) ? <p className="text-xs text-ink-muted">{rule.ruleKey === 'symbolic_duration' ? 'Students need the Wait block.' : 'Students need the Move (preview) block' + (rule.ruleKey === 'object_released' ? ' and the Open gripper block.' : rule.ruleKey === 'object_grasped' || rule.ruleKey === 'object_lifted' ? ' and the Close gripper block.' : '.')}</p> : null}
              {rule.ruleKey === 'ordered_actions' ? (
                <div className="space-y-2">{(rule.ruleConfig.actions as string[]).map((action, step) => (
                  <div key={step} className="flex items-end gap-2"><div className="flex-1">{select(`Rule ${index + 1} step ${step + 1}`, action, actionOptions, (v) => setConfig(index, { actions: (rule.ruleConfig.actions as string[]).map((a, i) => (i === step ? v : a)) }))}</div>
                    <Button variant="ghost" size="sm" disabled={(rule.ruleConfig.actions as string[]).length === 1} onClick={() => setConfig(index, { actions: (rule.ruleConfig.actions as string[]).filter((_, i) => i !== step) })} aria-label={`Remove step ${step + 1} of rule ${index + 1}`}>Remove step</Button></div>))}
                  <Button variant="secondary" size="sm" onClick={() => setConfig(index, { actions: [...(rule.ruleConfig.actions as string[]), 'wait'] })}>Add step</Button></div>) : null}
              <label className="block text-xs text-ink-muted">Feedback shown to the student (optional)<input aria-label={`Rule ${index + 1} feedback`} className={`${inputClasses} mt-1`} maxLength={300} value={rule.description ?? ''} onChange={(e) => setRule(index, { description: e.target.value })} /></label>
            </div>))}
          <Button variant="secondary" size="sm" disabled={rules.length >= 10} onClick={() => setRules((all) => [...all, { ruleKey: 'action_present', ruleConfig: { ...DEFAULT_CONFIG.action_present }, description: '' }])}>Add rule</Button>
        </section>
        {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
      </div>
    </Dialog>
  );
}
