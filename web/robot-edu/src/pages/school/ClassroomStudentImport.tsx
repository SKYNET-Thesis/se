import React, { useRef, useState } from 'react';
import { FileUpIcon } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { educationAdminApi, type ApiClassroomStudentImportResult, type ApiClassroomStudentPreview } from '../../lib/api';
import { parseSchoolCsv, type ImportRow } from '../../utils/schoolImport';
import { classroomImportResultSummary, classroomPreviewSummary, toClassroomStudentRows } from './classroomStudentImport';

interface Props {
  open: boolean;
  onClose: () => void;
  organizationId: string;
  classroomId: string;
  token: string;
  onPersisted: () => Promise<void>;
}

export function ClassroomStudentImport({ open, onClose, organizationId, classroomId, token, onPersisted }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [preview, setPreview] = useState<ApiClassroomStudentPreview | null>(null);
  const [result, setResult] = useState<ApiClassroomStudentImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => { setFileName(''); setRows([]); setPreview(null); setResult(null); setError(null); if (inputRef.current) inputRef.current.value = ''; };
  const close = () => { reset(); onClose(); };
  const upload = async (file: File) => {
    setBusy(true); setError(null); setResult(null); setFileName(file.name);
    try {
      const parsed = parseSchoolCsv('students', await file.text());
      setRows(parsed);
      const next = await educationAdminApi.previewClassroomStudentImport(organizationId, classroomId, token, { rows: toClassroomStudentRows(parsed) });
      setPreview(next);
    } catch { setPreview(null); setError('The student file could not be reviewed. Check the CSV and try again.'); }
    finally { setBusy(false); }
  };
  const confirm = async () => {
    setBusy(true); setError(null);
    try {
      const next = await educationAdminApi.confirmClassroomStudentImport(organizationId, classroomId, token, { rows: toClassroomStudentRows(rows) });
      setResult(next);
      if (next.createdAndAdded + next.existingAdded > 0) await onPersisted();
    } catch { setError('The classroom import could not be completed. Please try again.'); }
    finally { setBusy(false); }
  };
  const footer = result ? <Button onClick={close}>Done</Button> : <><Button variant="secondary" onClick={close}>Cancel</Button><Button onClick={() => void confirm()} loading={busy} disabled={!preview || preview.needsReview > 0 || preview.processed === 0}>Confirm import</Button></>;

  return <Dialog open={open} onClose={close} size="xl" title="Import students to classroom" description="Reuse existing school students or provision new students, then add them to this classroom." footer={footer}>
    <div className="space-y-5">
      {!preview && !result && <section className="rounded-lg border border-dashed border-line-strong px-5 py-10 text-center">
        <FileUpIcon className="mx-auto h-6 w-6 text-accent" />
        <h3 className="mt-3 font-semibold text-ink">Upload the Student CSV</h3>
        <p className="mx-auto mt-1 max-w-lg text-sm text-ink-muted">Required: first name, last name, student code, and grade. Email and guardian email are optional.</p>
        <input ref={inputRef} type="file" accept=".csv,text/csv" aria-label="Upload classroom student CSV" className="hidden" onChange={event => { const file = event.target.files?.[0]; if (file) void upload(file); }} />
        <Button className="mt-5" onClick={() => inputRef.current?.click()} loading={busy}>Choose CSV</Button>
      </section>}

      {preview && !result && <>
        <div><p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">Uploaded file</p><p className="mt-1 font-medium text-ink">{fileName}</p></div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">{classroomPreviewSummary(preview).map(([label, value]) => <Metric key={label} label={label} value={value} />)}</div>
        <div className="overflow-x-auto rounded-lg border border-line"><table className="w-full min-w-[820px] text-left text-sm"><thead className="bg-sunken text-xs uppercase tracking-wide text-ink-muted"><tr><th className="px-3 py-3">Student</th><th className="px-3 py-3">Student code</th><th className="px-3 py-3">Grade</th><th className="px-3 py-3">Email</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Review note</th></tr></thead><tbody>{preview.rows.map(row => <tr key={row.row} className="border-t border-line"><td className="px-3 py-3 font-medium text-ink">{row.firstName} {row.lastName}</td><td className="px-3 py-3">{row.studentCode}</td><td className="px-3 py-3">{row.gradeLevel}</td><td className="px-3 py-3">{row.email ?? '—'}</td><td className="px-3 py-3"><Status status={row.status} /></td><td className="px-3 py-3 text-ink-muted">{[...row.errors, ...row.warnings].join(' ') || '—'}</td></tr>)}</tbody></table></div>
        <Button variant="ghost" onClick={reset}>Choose another file</Button>
      </>}

      {result && <>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">{classroomImportResultSummary(result).map(([label, value]) => <Metric key={label} label={label} value={value} />)}</div>
        <div className={result.failed > 0 ? 'rounded-md bg-warn-soft px-4 py-4 text-sm text-warn' : 'rounded-md bg-ok-soft px-4 py-4 text-sm text-ok'}><p className="font-semibold">{result.failed > 0 ? 'Import completed with rows needing attention.' : 'Students were saved to the classroom.'}</p><p className="mt-1">Persistence was confirmed by the Education API.</p></div>
        {result.failed > 0 && <div className="divide-y divide-line rounded-md border border-line">{result.results.filter(item => item.status === 'failed').map(item => <div key={item.row} className="px-3 py-3 text-sm"><p className="font-medium text-ink">{item.name} · {item.studentCode}</p><p className="mt-1 text-ink-muted">{item.message ?? 'This row could not be imported.'}</p></div>)}</div>}
      </>}
      {error && <p role="alert" className="rounded-md bg-danger-soft px-3 py-3 text-sm text-danger">{error}</p>}
    </div>
  </Dialog>;
}

function Metric({ label, value }: { label: string; value: number }) { return <div className="rounded-md bg-sunken px-4 py-3"><p className="text-xl font-semibold text-ink">{value}</p><p className="mt-1 text-xs text-ink-muted">{label}</p></div>; }
function Status({ status }: { status: ApiClassroomStudentPreview['rows'][number]['status'] }) { const label = status === 'new_student' ? 'New student' : status === 'existing_student' ? 'Existing student' : status === 'already_in_class' ? 'Already in class' : 'Needs review'; const tone = status === 'needs_review' ? 'bg-danger-soft text-danger' : status === 'already_in_class' ? 'bg-sunken text-ink-muted' : 'bg-ok-soft text-ok'; return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${tone}`}>{label}</span>; }
