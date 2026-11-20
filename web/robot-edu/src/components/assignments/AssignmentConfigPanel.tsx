import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { assignmentApi } from '../../lib/api';
import { Button } from '../ui/Button';
import { LEVEL_LABEL, type AcademicLevel } from '../academic/LevelBadge';

type Row = { title: string; description: string; maxPoints: string };
const field = 'mt-1 w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink';
const toLocal = (iso?: string | null) => { if (!iso) return ''; const d = new Date(iso); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
const toIso = (local: string) => (local ? new Date(local).toISOString() : null);

export type ScheduleValues = { availableFrom?: string | null; dueAt?: string | null; closeAt?: string | null; maxAttempts?: number | null };

/** Instructor configuration of an existing assignment: rubric criteria and delivery schedule/attempt limit. */
export function AssignmentConfigPanel({ classroomId, assignmentId, token, schedule }: { classroomId: string; assignmentId: string; token: string; schedule?: ScheduleValues }) {
  const client = useQueryClient();
  const rubric = useQuery({ queryKey: ['assignment-rubric', assignmentId], queryFn: () => assignmentApi.getRubric(classroomId, assignmentId, token), enabled: Boolean(token) });
  const [rows, setRows] = useState<Row[]>([]);
  const [rubricMsg, setRubricMsg] = useState<string | null>(null);
  const [from, setFrom] = useState(toLocal(schedule?.availableFrom)); const [due, setDue] = useState(toLocal(schedule?.dueAt)); const [close, setClose] = useState(toLocal(schedule?.closeAt));
  const [attempts, setAttempts] = useState(schedule?.maxAttempts ? String(schedule.maxAttempts) : '');
  const [scheduleMsg, setScheduleMsg] = useState<string | null>(null);
  useEffect(() => { if (rubric.data) setRows(rubric.data.criteria.map((c) => ({ title: c.title, description: c.description ?? '', maxPoints: String(c.maxPoints) }))); }, [rubric.data]);
  const total = rows.reduce((sum, r) => sum + (Number(r.maxPoints) || 0), 0);
  const invalid = !rows.length || rows.some((r) => !r.title.trim() || !(Number(r.maxPoints) > 0));
  const saveRubric = useMutation({
    mutationFn: () => assignmentApi.replaceRubric(classroomId, assignmentId, token, rows.map((r) => ({ title: r.title.trim(), ...(r.description.trim() ? { description: r.description.trim() } : {}), maxPoints: Number(r.maxPoints) }))),
    onSuccess: async () => { setRubricMsg('Rubric saved.'); await client.invalidateQueries({ queryKey: ['assignment-rubric', assignmentId] }); },
    onError: (e) => setRubricMsg(e instanceof Error ? e.message : 'The rubric could not be saved.'),
  });
  const saveSchedule = useMutation({
    mutationFn: () => assignmentApi.updateSchedule(classroomId, assignmentId, token, { availableFrom: toIso(from), dueAt: toIso(due), closeAt: toIso(close), maxAttempts: attempts ? Number(attempts) : null }),
    onSuccess: () => setScheduleMsg('Schedule saved.'),
    onError: (e) => setScheduleMsg(e instanceof Error ? e.message : 'The schedule could not be saved.'),
  });
  const editable = rubric.data?.editable ?? false;
  const update = (i: number, patch: Partial<Row>) => setRows((cur) => cur.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  return <div className="space-y-6">
    <section aria-label="Rubric editor">
      <h3 className="text-[13px] font-semibold text-ink">Rubric</h3>
      {rubric.isLoading && <p className="mt-2 text-sm text-ink-muted">Loading rubric…</p>}
      {rubric.error && <p role="alert" className="mt-2 text-sm text-danger">The rubric could not be loaded.</p>}
      {rubric.data && !editable && rubric.data.lockedReason && <p className="mt-2 text-xs text-ink-muted">{rubric.data.lockedReason}</p>}
      {rubric.data && <div className="mt-2 space-y-2">
        {rows.map((r, i) => <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_6rem_auto]">
          <input className={field} aria-label={`Criterion ${i + 1} title`} placeholder="Criterion title" maxLength={200} disabled={!editable} value={r.title} onChange={(e) => update(i, { title: e.target.value })} />
          <input className={field} aria-label={`Criterion ${i + 1} description`} placeholder="Description (optional)" maxLength={2000} disabled={!editable} value={r.description} onChange={(e) => update(i, { description: e.target.value })} />
          <input className={field} aria-label={`Criterion ${i + 1} max points`} type="number" min={0.01} step={0.01} disabled={!editable} value={r.maxPoints} onChange={(e) => update(i, { maxPoints: e.target.value })} />
          {editable && <Button size="sm" variant="ghost" onClick={() => setRows((cur) => cur.filter((_, idx) => idx !== i))}>Remove</Button>}
        </div>)}
        {!rows.length && <p className="text-sm text-ink-muted">No criteria yet. Add at least one so submissions can be scored.</p>}
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-ink-muted">Total: {total} points</span>
          {editable && <><Button size="sm" variant="secondary" disabled={rows.length >= 20} onClick={() => setRows((cur) => [...cur, { title: '', description: '', maxPoints: '1' }])}>Add criterion</Button>
            <Button size="sm" disabled={invalid} loading={saveRubric.isPending} onClick={() => { setRubricMsg(null); saveRubric.mutate(); }}>Save rubric</Button></>}
        </div>
        {rubricMsg && <p role="status" className="text-sm text-ink-muted">{rubricMsg}</p>}
      </div>}
    </section>
    <AssignmentAcademicSection classroomId={classroomId} assignmentId={assignmentId} token={token} />
    <section aria-label="Delivery schedule">
      <h3 className="text-[13px] font-semibold text-ink">Schedule and attempts</h3>
      <div className="mt-2 grid gap-3 sm:grid-cols-4">
        <label className="text-sm">Opens<input className={field} type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="text-sm">Due<input className={field} type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} /></label>
        <label className="text-sm">Closes<input className={field} type="datetime-local" value={close} onChange={(e) => setClose(e.target.value)} /></label>
        <label className="text-sm">Max attempts<input className={field} type="number" min={1} placeholder="Unlimited" value={attempts} onChange={(e) => setAttempts(e.target.value)} /></label>
      </div>
      <div className="mt-2 flex items-center gap-3"><Button size="sm" loading={saveSchedule.isPending} onClick={() => { setScheduleMsg(null); saveSchedule.mutate(); }}>Save schedule</Button>{scheduleMsg && <p role="status" className="text-sm text-ink-muted">{scheduleMsg}</p>}</div>
      <p className="mt-2 text-xs text-ink-muted">Students cannot start a new attempt before the opening time or after the closing time. Leave a field empty for no limit.</p>
    </section>
  </div>;
}

const TYPE_LABEL: Record<string, string> = { knowledge: 'Knowledge-based', quiz: 'Quiz-based assessment', blockly: 'Blockly programming', simulation: 'Simulation', robot_lab: 'Robot Lab (where configured)', manual_final: 'Manual instructor-graded final' };
const METHOD_LABEL: Record<string, string> = { automatic: 'Automatic', manual: 'Manual (instructor)', mixed: 'Automatic + manual' };

/** Assignment difficulty is independent of the course level; type, pass score, grading method and objectives are shown to students. */
function AssignmentAcademicSection({ classroomId, assignmentId, token }: { classroomId: string; assignmentId: string; token: string }) {
  const client = useQueryClient();
  const academic = useQuery({ queryKey: ['assignment-academic', assignmentId], queryFn: () => assignmentApi.getAcademic(classroomId, assignmentId, token), enabled: Boolean(token) });
  const [difficulty, setDifficulty] = useState(''); const [type, setType] = useState(''); const [method, setMethod] = useState(''); const [pass, setPass] = useState(''); const [objectives, setObjectives] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => { const d = academic.data; if (!d) return; setDifficulty(d.difficulty ?? ''); setType(d.assignmentType ?? ''); setMethod(d.gradingMethod ?? ''); setPass(d.passScore === null ? '' : String(d.passScore)); setObjectives(d.learningObjectives.join('\n')); }, [academic.data]);
  const save = useMutation({
    mutationFn: () => assignmentApi.updateAcademic(classroomId, assignmentId, token, { difficulty: difficulty || null, assignmentType: type || null, gradingMethod: method || null, passScore: pass === '' ? null : Number(pass), learningObjectives: objectives.split('\n').map((line) => line.trim()).filter(Boolean) }),
    onSuccess: async () => { setMessage('Academic settings saved.'); await client.invalidateQueries({ queryKey: ['assignment-academic', assignmentId] }); },
    onError: (e) => setMessage(e instanceof Error ? e.message : 'The academic settings could not be saved.'),
  });
  const hint = type === 'manual_final' || type === 'robot_lab' ? 'This type needs manual or mixed grading.' : difficulty === 'BEGINNER' ? 'Beginner assignments can be Blockly-only and need no robot or Digital Twin.' : difficulty === 'ADVANCED' ? 'Advanced assignments may use simulation or a Robot Lab and support manual grading.' : null;
  return <section aria-label="Academic settings">
    <h3 className="text-[13px] font-semibold text-ink">Academic settings</h3>
    <div className="mt-2 grid gap-3 sm:grid-cols-4">
      <label className="text-sm">Difficulty<select aria-label="Assignment difficulty" className={field} value={difficulty} onChange={(e) => setDifficulty(e.target.value)}><option value="">Not set</option>{(Object.keys(LEVEL_LABEL) as AcademicLevel[]).map((level) => <option key={level} value={level}>{LEVEL_LABEL[level]}</option>)}</select></label>
      <label className="text-sm">Assignment type<select aria-label="Assignment type" className={field} value={type} onChange={(e) => setType(e.target.value)}><option value="">Not set</option>{Object.entries(TYPE_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="text-sm">Grading method<select aria-label="Grading method" className={field} value={method} onChange={(e) => setMethod(e.target.value)}><option value="">Not set</option>{Object.entries(METHOD_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="text-sm">Pass score{academic.data?.maxScore ? ` (max ${academic.data.maxScore})` : ''}<input aria-label="Pass score" className={field} type="number" min={0} value={pass} onChange={(e) => setPass(e.target.value)} /></label>
    </div>
    <label className="mt-3 block text-sm">Learning objectives (one per line)<textarea aria-label="Learning objectives" className={field} rows={3} value={objectives} onChange={(e) => setObjectives(e.target.value)} /></label>
    <div className="mt-2 flex items-center gap-3"><Button size="sm" loading={save.isPending} onClick={() => { setMessage(null); save.mutate(); }}>Save academic settings</Button>{message && <p role="status" className="text-sm text-ink-muted">{message}</p>}</div>
    {hint && <p className="mt-2 text-xs text-ink-muted">{hint}</p>}
  </section>;
}
