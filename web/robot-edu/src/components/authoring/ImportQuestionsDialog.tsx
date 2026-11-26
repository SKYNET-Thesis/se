import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { quizAuthoringApi, type QuestionImportPreview, type QuestionImportResult } from '../../lib/api';

type Props = { open: boolean; onClose: () => void; lessonId: string; token: string; onImported: (result: QuestionImportResult) => void };
const field = 'mt-1 w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink';

/** Bulk-imports questions from CSV/XLSX into the lesson's Question Bank: preview first, then commit valid rows. */
export function ImportQuestionsDialog({ open, onClose, lessonId, token, onImported }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<QuestionImportPreview | null>(null);
  const [result, setResult] = useState<QuestionImportResult | null>(null);
  const [objectiveId, setObjectiveId] = useState('');
  const [newObjective, setNewObjective] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [publishNow, setPublishNow] = useState(false);
  const objectives = useQuery({ queryKey: ['quiz-authoring-objectives', lessonId], queryFn: () => quizAuthoringApi.objectives(lessonId, token), enabled: open });
  const reset = () => { setFile(null); setPreview(null); setResult(null); setObjectiveId(''); setNewObjective(''); setConfirmed(false); setPublishNow(false); };
  const close = () => { reset(); onClose(); };
  const previewMutation = useMutation({ mutationFn: (f: File) => quizAuthoringApi.importPreview(lessonId, token, f), onSuccess: setPreview });
  const commit = useMutation({
    mutationFn: () => quizAuthoringApi.importCommit(lessonId, token, file!, { ...(objectiveId ? { objectiveId } : newObjective.trim() ? { newObjective: newObjective.trim() } : {}), expectedSha256: preview!.fileSha256, confirm: 'true', ...(publishNow ? { publish: 'true' } : {}) }),
    onSuccess: (r) => { setResult(r); onImported(r); },
  });
  const download = async (format: 'csv' | 'xlsx') => {
    const blob = await quizAuthoringApi.downloadTemplate(token, format);
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = `question-bank-template.${format}`; a.click(); URL.revokeObjectURL(url);
  };
  const choose = (f: File | null) => { setFile(f); setPreview(null); setResult(null); setConfirmed(false); previewMutation.reset(); if (f) previewMutation.mutate(f); };
  const error = previewMutation.error ?? commit.error;
  const needsOutcome = !!preview && preview.items.some((i) => i.status === 'valid' && !i.learningObjectiveCode);
  const canImport = !!preview && preview.valid > 0 && (!needsOutcome || !!objectiveId || !!newObjective.trim()) && confirmed && !result;
  const downloadErrors = () => {
    if (!preview) return;
    const esc = (v: string | number | undefined) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [['row', 'status', 'question', 'details'].join(','), ...preview.items.filter((i) => i.status !== 'valid').map((i) => [i.rowNumber, i.status, i.stem, i.errors.join(' ') || (i.duplicateOf ? (i.duplicateOf.row ? `Same as row ${i.duplicateOf.row}` : `Already in Question Bank (${i.duplicateOf.existingCode})`) : '')].map(esc).join(','))];
    const url = URL.createObjectURL(new Blob([`${lines.join('\r\n')}\r\n`], { type: 'text/csv' })); const a = document.createElement('a');
    a.href = url; a.download = 'question-import-report.csv'; a.click(); URL.revokeObjectURL(url);
  };
  return <Dialog open={open} onClose={close} title="Import questions" size="lg" description="Upload a .csv or .xlsx file (max 1 MB, 500 rows). Questions are checked first; nothing is saved until you import."
    footer={<><Button variant="secondary" onClick={close}>{result ? 'Done' : 'Cancel'}</Button>{!result && <Button disabled={!canImport} loading={commit.isPending} onClick={() => commit.mutate()}>Import {preview?.valid ?? 0} valid question{preview?.valid === 1 ? '' : 's'}</Button>}</>}>
    <div className="space-y-3">
      <p className="text-sm">Template: <button type="button" className="underline" onClick={() => void download('csv')}>CSV</button> · <button type="button" className="underline" onClick={() => void download('xlsx')}>XLSX</button></p>
      <label className="block text-sm font-medium">File<input className={field} type="file" accept=".csv,.xlsx" aria-label="Question file" onChange={(e) => choose(e.target.files?.[0] ?? null)} /></label>
      {previewMutation.isPending && <p className="text-sm">Checking file…</p>}
      {error && <p role="alert" className="text-sm text-danger">{error instanceof Error ? error.message : 'Import failed.'}</p>}
      {preview && !result && <>
        <p className="text-sm" role="status">{preview.total} rows · {preview.valid} valid · {preview.invalid} with errors · {preview.duplicates} {preview.duplicates === 1 ? 'duplicate' : 'duplicates'} (skipped)</p>
        <div className="max-h-56 overflow-auto rounded-md border border-line"><table className="w-full text-left text-xs"><thead><tr><th className="p-2">Row</th><th className="p-2">Status</th><th className="p-2">Question</th><th className="p-2">Type</th><th className="p-2">Points</th><th className="p-2">Mapping</th><th className="p-2">Details</th></tr></thead><tbody>
          {preview.items.map((i) => <tr key={i.rowNumber} className="border-t border-line"><td className="p-2">{i.rowNumber}</td><td className="p-2"><Badge tone={i.status === 'valid' ? 'ok' : i.status === 'duplicate' ? 'warn' : 'danger'}>{i.status}</Badge></td><td className="p-2">{i.stem ?? ''}</td><td className="p-2">{i.type?.replace(/_/g, ' ') ?? ''}</td><td className="p-2">{i.points !== undefined ? `${i.points}${i.pointsSource === 'default' ? ' (default)' : ''}` : ''}</td><td className="p-2">{[i.topic, i.learningSection, i.learningObjectiveCode].filter(Boolean).join(' · ')}</td><td className="p-2">{i.errors.join(' ') || (i.duplicateOf ? (i.duplicateOf.row ? `Same as row ${i.duplicateOf.row}` : `Already in Question Bank (${i.duplicateOf.existingCode})`) : '')}</td></tr>)}
        </tbody></table></div>
        {(needsOutcome || !!objectiveId) && <label className="block text-sm font-medium">Learning Outcome for rows without a learning_objective
          <select className={field} value={objectiveId} onChange={(e) => setObjectiveId(e.target.value)}><option value="">New outcome…</option>{objectives.data?.map((o) => <option key={o.id} value={o.id}>{o.code}: {o.description}</option>)}</select></label>}
        {needsOutcome && !objectiveId && <label className="block text-sm font-medium">New Learning Outcome<input className={field} value={newObjective} maxLength={500} onChange={(e) => setNewObjective(e.target.value)} /></label>}
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={publishNow} onChange={(e) => setPublishNow(e.target.checked)} />Publish immediately (otherwise questions are imported as drafts)</label>
        <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />I reviewed this preview and want to import the valid rows.</label>
        {preview.items.some((i) => i.status !== 'valid') && <p><button type="button" className="text-sm underline" onClick={downloadErrors}>Download error report (CSV)</button></p>}
      </>}
      {result && <div role="status" className="space-y-1 text-sm"><p>Imported {result.created} question{result.created === 1 ? '' : 's'} as {publishNow ? 'published' : 'draft'}. Skipped: {result.invalid} invalid, {result.duplicates} duplicate{result.failed ? `, ${result.failed} failed` : ''}.</p>{result.results.filter((r) => r.status === 'failed').map((r) => <p key={r.rowNumber} className="text-danger">Row {r.rowNumber}: {r.message}</p>)}<p className="text-ink-muted">Points (file value, or the difficulty default: easy 1, medium 2, hard 3) are pre-filled when you add published questions to the quiz; you can change them there.</p></div>}
    </div>
  </Dialog>;
}
