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
  const objectives = useQuery({ queryKey: ['quiz-authoring-objectives', lessonId], queryFn: () => quizAuthoringApi.objectives(lessonId, token), enabled: open });
  const reset = () => { setFile(null); setPreview(null); setResult(null); setObjectiveId(''); setNewObjective(''); };
  const close = () => { reset(); onClose(); };
  const previewMutation = useMutation({ mutationFn: (f: File) => quizAuthoringApi.importPreview(lessonId, token, f), onSuccess: setPreview });
  const commit = useMutation({
    mutationFn: () => quizAuthoringApi.importCommit(lessonId, token, file!, objectiveId ? { objectiveId } : { newObjective: newObjective.trim() }),
    onSuccess: (r) => { setResult(r); onImported(r); },
  });
  const download = async (format: 'csv' | 'xlsx') => {
    const blob = await quizAuthoringApi.downloadTemplate(token, format);
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = `question-bank-template.${format}`; a.click(); URL.revokeObjectURL(url);
  };
  const choose = (f: File | null) => { setFile(f); setPreview(null); setResult(null); previewMutation.reset(); if (f) previewMutation.mutate(f); };
  const error = previewMutation.error ?? commit.error;
  const canImport = !!preview && preview.valid > 0 && (!!objectiveId || !!newObjective.trim()) && !result;
  return <Dialog open={open} onClose={close} title="Import questions" size="lg" description="Upload a .csv or .xlsx file (max 1 MB, 500 rows). Questions are checked first; nothing is saved until you import."
    footer={<><Button variant="secondary" onClick={close}>{result ? 'Done' : 'Cancel'}</Button>{!result && <Button disabled={!canImport} loading={commit.isPending} onClick={() => commit.mutate()}>Import {preview?.valid ?? 0} valid question{preview?.valid === 1 ? '' : 's'}</Button>}</>}>
    <div className="space-y-3">
      <p className="text-sm">Template: <button type="button" className="underline" onClick={() => void download('csv')}>CSV</button> · <button type="button" className="underline" onClick={() => void download('xlsx')}>XLSX</button></p>
      <label className="block text-sm font-medium">File<input className={field} type="file" accept=".csv,.xlsx" aria-label="Question file" onChange={(e) => choose(e.target.files?.[0] ?? null)} /></label>
      {previewMutation.isPending && <p className="text-sm">Checking file…</p>}
      {error && <p role="alert" className="text-sm text-danger">{error instanceof Error ? error.message : 'Import failed.'}</p>}
      {preview && !result && <>
        <p className="text-sm" role="status">{preview.total} rows · {preview.valid} valid · {preview.invalid} with errors · {preview.duplicates} {preview.duplicates === 1 ? 'duplicate' : 'duplicates'} (skipped)</p>
        <div className="max-h-56 overflow-auto rounded-md border border-line"><table className="w-full text-left text-xs"><thead><tr><th className="p-2">Row</th><th className="p-2">Status</th><th className="p-2">Question</th><th className="p-2">Details</th></tr></thead><tbody>
          {preview.items.map((i) => <tr key={i.rowNumber} className="border-t border-line"><td className="p-2">{i.rowNumber}</td><td className="p-2"><Badge tone={i.status === 'valid' ? 'ok' : i.status === 'duplicate' ? 'warn' : 'danger'}>{i.status}</Badge></td><td className="p-2">{i.stem ?? ''}</td><td className="p-2">{i.errors.join(' ') || (i.duplicateOf ? (i.duplicateOf.row ? `Same as row ${i.duplicateOf.row}` : `Already in Question Bank (${i.duplicateOf.existingCode})`) : '')}</td></tr>)}
        </tbody></table></div>
        <label className="block text-sm font-medium">Learning Outcome for imported questions
          <select className={field} value={objectiveId} onChange={(e) => setObjectiveId(e.target.value)}><option value="">New outcome…</option>{objectives.data?.map((o) => <option key={o.id} value={o.id}>{o.code}: {o.description}</option>)}</select></label>
        {!objectiveId && <label className="block text-sm font-medium">New Learning Outcome<input className={field} value={newObjective} maxLength={500} onChange={(e) => setNewObjective(e.target.value)} /></label>}
      </>}
      {result && <div role="status" className="space-y-1 text-sm"><p>Imported {result.created} question{result.created === 1 ? '' : 's'}. Skipped: {result.invalid} invalid, {result.duplicates} duplicate{result.failed ? `, ${result.failed} failed` : ''}.</p>{result.results.filter((r) => r.status === 'failed').map((r) => <p key={r.rowNumber} className="text-danger">Row {r.rowNumber}: {r.message}</p>)}<p className="text-ink-muted">Points from the file are pre-filled when you add the questions to the quiz.</p></div>}
    </div>
  </Dialog>;
}
