import { useEffect, useId, useRef, useState } from 'react';
import { CheckIcon, DownloadIcon, FileTextIcon, FileUpIcon } from 'lucide-react';
import { Badge, type BadgeTone } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { educationAdminApi, type ApiClassroomStudentImportResult, type ApiClassroomStudentPreview } from '../../lib/api';
import { cn } from '../../utils/cn';
import { parseSchoolCsv, template, type ImportRow } from '../../utils/schoolImport';
import {
  MAX_IMPORT_ROWS, PREVIEW_FILTERS, STUDENT_CSV_COLUMNS, addedCount, csvProblemMessage, failedRowsCsv, importableCount, previewGroup, previewStatusLabel,
  studentCsvProblem, toClassroomStudentRows, type PreviewGroup,
} from './classroomStudentImport';

interface Props {
  open: boolean;
  onClose: () => void;
  organizationId: string;
  classroomId: string;
  classroomName: string;
  token: string;
  onPersisted: () => Promise<void>;
}

type Busy = 'checking' | 'importing' | null;
type PreviewRow = ApiClassroomStudentPreview['rows'][number];
const STEPS = ['Choose file', 'Review', 'Done'] as const;
const statusTone: Record<PreviewRow['status'], BadgeTone> = { new_student: 'ok', existing_student: 'ok', already_in_class: 'neutral', needs_review: 'danger' };
const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

function downloadText(fileName: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
  const link = document.createElement('a'); link.href = url; link.download = fileName; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * Classroom CSV import (A02): choose file → server preview → confirm → server results. Both steps call the existing
 * endpoints with the same body. The service validates every row again on confirm and adds the valid ones even when
 * others fail, so the UI imports what can be added and reports each skipped or failed row from the server's answer.
 */
export function ClassroomStudentImport({ open, onClose, organizationId, classroomId, classroomName, token, onPersisted }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [preview, setPreview] = useState<ApiClassroomStudentPreview | null>(null);
  const [result, setResult] = useState<ApiClassroomStudentImportResult | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | PreviewGroup>('all');
  const [dragging, setDragging] = useState(false);

  const step = result ? 2 : preview ? 1 : 0;
  // Each step replaces the controls that had focus; move focus to the new step's summary so keyboard and screen-reader
  // users land on what changed instead of the page behind the dialog.
  const stepFocusRef = useRef<HTMLElement | null>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const previousStep = useRef(step);
  useEffect(() => {
    if (previousStep.current !== step && open) window.setTimeout(() => (step === 0 ? document.getElementById(`${inputId}-choose`) : stepFocusRef.current)?.focus(), 0);
    previousStep.current = step;
  }, [step, open, inputId]);
  const reset = () => { setFileName(''); setRows([]); setPreview(null); setResult(null); setError(null); setFilter('all'); if (inputRef.current) inputRef.current.value = ''; };
  const close = () => { if (busy) return; reset(); onClose(); };

  /** Errors replace or disable the control that had focus, so move focus to the message (it is above the rows). */
  const showError = (message: string) => { setError(message); window.setTimeout(() => errorRef.current?.focus(), 0); };

  const choose = async (file: File) => {
    setError(null); setResult(null); setPreview(null); setFilter('all'); setFileName(file.name);
    if (!/\.csv$/i.test(file.name) && file.type !== 'text/csv') { showError('Choose a .csv file. Spreadsheets can be saved as CSV from File → Save as.'); return; }
    setBusy('checking');
    try {
      const source = await file.text();
      const problem = studentCsvProblem(source);
      if (problem) { showError(csvProblemMessage(problem)); return; }
      const parsed = parseSchoolCsv('students', source);
      setRows(parsed);
      setPreview(await educationAdminApi.previewClassroomStudentImport(organizationId, classroomId, token, { rows: toClassroomStudentRows(parsed) }));
    } catch (cause) {
      setPreview(null);
      showError(cause instanceof Error && cause.message ? `The file couldn’t be checked: ${cause.message}` : 'The file couldn’t be checked. Try again.');
    } finally { setBusy(null); if (inputRef.current) inputRef.current.value = ''; }
  };

  const confirm = async () => {
    if (busy || !preview) return;
    setBusy('importing'); setError(null);
    try {
      const next = await educationAdminApi.confirmClassroomStudentImport(organizationId, classroomId, token, { rows: toClassroomStudentRows(rows) });
      setResult(next);
      if (addedCount(next) > 0) await onPersisted();
    } catch (cause) {
      // Rows are added one by one, so a failed request may still have added some students. Show the real list.
      await onPersisted().catch(() => undefined);
      showError(`${cause instanceof Error && cause.message ? `${cause.message} ` : ''}The import didn’t finish. Some students may already have been added, so check the member list before importing this file again.`);
    } finally { setBusy(null); }
  };

  const addable = preview ? importableCount(preview) : 0;
  const footer = step === 2
    ? <><Button variant="secondary" onClick={reset}>Import another file</Button><Button variant="primary" onClick={close} data-autofocus>Done</Button></>
    : <><Button variant="secondary" onClick={close} disabled={Boolean(busy)}>Cancel</Button>
      {step === 1 && <Button variant="primary" onClick={() => void confirm()} loading={busy === 'importing'} disabled={addable === 0}>{busy === 'importing' ? 'Adding students…' : addable === 0 ? 'Nothing to add' : `Add ${plural(addable, 'student')}`}</Button>}</>;

  return <Dialog open={open} onClose={close} size="lg" className="vista-school" title="Import students"
    description={<>Add a class list to <span className="font-medium text-ink">{classroomName}</span> from a CSV file.</>} footer={footer}>
    <div className="space-y-5">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs" aria-label="Import steps">
        {STEPS.map((label, index) => <li key={label} aria-current={index === step ? 'step' : undefined} className={cn('flex items-center gap-1.5', index === step ? 'font-semibold text-ink' : index < step ? 'text-ink-muted' : 'text-ink-subtle')}>
          <span className={cn('grid h-5 w-5 place-items-center rounded-full text-[11px] tabular-nums', index < step ? 'bg-accent text-white' : index === step ? 'border-2 border-accent text-accent-ink' : 'border border-line-strong')}>{index < step ? <CheckIcon className="h-3 w-3" aria-hidden /> : index + 1}</span>
          {label}{index < STEPS.length - 1 && <span aria-hidden className="ml-0.5 h-px w-6 bg-line-strong" />}
        </li>)}
      </ol>

      {error && <p ref={errorRef} tabIndex={-1} role="alert" className="border-l-4 border-danger bg-danger-soft p-3 text-sm text-danger focus-visible:outline-none">{error}</p>}

      {step === 0 && <>
        <div onDragOver={event => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)}
          onDrop={event => { event.preventDefault(); setDragging(false); const file = event.dataTransfer.files?.[0]; if (file && !busy) void choose(file); }}
          className={cn('rounded-lg border-2 border-dashed px-5 py-8 text-center transition-colors duration-150', dragging ? 'border-accent bg-accent-soft/40' : 'border-line-strong')}>
          <FileUpIcon className="mx-auto h-6 w-6 text-accent" aria-hidden />
          <p className="mt-2 text-sm font-medium text-ink">{busy === 'checking' ? `Checking ${fileName}…` : 'Drop a CSV file here, or choose one'}</p>
          <p className="mt-1 text-xs text-ink-muted">One student per row, up to {MAX_IMPORT_ROWS} rows.</p>
          <Button id={`${inputId}-choose`} data-autofocus className="mt-4" variant="primary" onClick={() => inputRef.current?.click()} loading={busy === 'checking'} icon={<FileTextIcon className="h-4 w-4" aria-hidden />}>{busy === 'checking' ? 'Checking file…' : 'Choose CSV file'}</Button>
          <input ref={inputRef} id={inputId} type="file" accept=".csv,text/csv" className="sr-only" tabIndex={-1} aria-hidden
            onChange={event => { const file = event.target.files?.[0]; if (file) void choose(file); }} />
        </div>
        <div className="grid gap-4 text-sm sm:grid-cols-[1fr_auto] sm:items-start">
          <div className="space-y-2">
            <p className="font-medium text-ink">What the file needs</p>
            <p className="flex flex-wrap items-center gap-1.5 text-ink-muted">Required: {STUDENT_CSV_COLUMNS.required.map(column => <code key={column} className="rounded bg-sunken px-1.5 py-0.5 text-xs text-ink">{column}</code>)}</p>
            <p className="flex flex-wrap items-center gap-1.5 text-ink-muted">Optional: {STUDENT_CSV_COLUMNS.optional.map(column => <code key={column} className="rounded bg-sunken px-1.5 py-0.5 text-xs text-ink">{column}</code>)}</p>
            <p className="text-ink-muted">Values can’t contain commas or quotation marks.</p>
            <p className="text-ink-muted">Students already in your school are matched by student code. Anyone new gets a school account and joins this classroom. You can review every row before anything is saved.</p>
          </div>
          <Button size="sm" variant="secondary" onClick={() => downloadText('vista-classroom-students-template.csv', template('students'))} icon={<DownloadIcon className="h-4 w-4" aria-hidden />}>Download template</Button>
        </div>
      </>}

      {step === 1 && preview && <Review preview={preview} fileName={fileName} filter={filter} onFilter={setFilter} onReplace={reset} busy={Boolean(busy)} summaryRef={(node) => { stepFocusRef.current = node; }} />}

      {step === 2 && result && <Results result={result} classroomName={classroomName} summaryRef={(node) => { stepFocusRef.current = node; }} />}

    </div>
  </Dialog>;
}

function Review({ preview, fileName, filter, onFilter, onReplace, busy, summaryRef }: { preview: ApiClassroomStudentPreview; fileName: string; filter: 'all' | PreviewGroup; onFilter: (value: 'all' | PreviewGroup) => void; onReplace: () => void; busy: boolean; summaryRef: (node: HTMLElement | null) => void }) {
  const addable = importableCount(preview);
  const counts: Record<'all' | PreviewGroup, number> = { all: preview.processed, add: addable, already: preview.alreadyInClass, fix: preview.needsReview };
  const visible = preview.rows.filter(row => filter === 'all' || previewGroup(row.status) === filter);
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line px-3 py-2">
      <p className="flex min-w-0 items-center gap-2 text-sm"><FileTextIcon className="h-4 w-4 shrink-0 text-ink-subtle" aria-hidden /><span className="truncate font-medium text-ink" title={fileName}>{fileName}</span><span className="shrink-0 tabular-nums text-ink-muted">{plural(preview.processed, 'row')}</span></p>
      <Button size="sm" variant="ghost" onClick={onReplace} disabled={busy}>Choose another file</Button>
    </div>

    <p ref={summaryRef} tabIndex={-1} className="text-sm text-ink focus-visible:outline-none">
      <span className="font-semibold">{plural(addable, 'student')} will be added</span>
      {addable > 0 && <span className="text-ink-muted"> ({preview.newStudents} new to your school, {preview.existingStudents} already in your school)</span>}.
      {preview.alreadyInClass > 0 && <span className="text-ink-muted"> {plural(preview.alreadyInClass, 'row')} already in this class will be left as is.</span>}
    </p>
    {preview.needsReview > 0 && <p className="border-l-4 border-warn bg-warn-soft p-3 text-sm text-ink">
      <span className="font-medium">{plural(preview.needsReview, 'row needs', 'rows need')} fixing and will be skipped.</span> Fix {preview.needsReview === 1 ? 'it' : 'them'} in your file and import it again; rows already added are left as they are.
    </p>}

    <div role="group" aria-label="Show rows" className="flex flex-wrap gap-1">
      {PREVIEW_FILTERS.map(item => <button key={item.value} type="button" aria-pressed={filter === item.value} onClick={() => onFilter(item.value)}
        className={cn('inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm transition-colors duration-150', filter === item.value ? 'bg-accent-soft font-medium text-accent-ink' : 'text-ink-muted hover:bg-sunken hover:text-ink')}>
        {item.label}<span className="text-xs tabular-nums opacity-80">{counts[item.value]}</span>
      </button>)}
    </div>

    {visible.length === 0 ? <p className="rounded-md border border-dashed border-line-strong px-4 py-6 text-center text-sm text-ink-muted">No rows in this group.</p> : <>
      <div className="hidden overflow-hidden rounded-md border border-line md:block">
        <table className="w-full table-fixed text-left text-sm">
          <thead className="bg-sunken text-xs text-ink-muted"><tr>
            <th scope="col" className="w-12 px-3 py-2 font-medium">Row</th>
            <th scope="col" className="px-3 py-2 font-medium">Student</th>
            <th scope="col" className="w-28 px-3 py-2 font-medium">Student code</th>
            <th scope="col" className="w-32 px-3 py-2 font-medium">Status</th>
            <th scope="col" className="w-[32%] px-3 py-2 font-medium">Notes</th>
          </tr></thead>
          <tbody className="divide-y divide-line">{visible.map(row => <tr key={row.row} className={row.status === 'needs_review' ? 'bg-danger-soft/40' : undefined}>
            <td className="px-3 py-2.5 tabular-nums text-ink-muted">{row.row}</td>
            <td className="min-w-0 px-3 py-2.5"><span className="block truncate font-medium text-ink">{[row.firstName, row.lastName].filter(Boolean).join(' ') || <span className="text-ink-subtle">No name</span>}</span><span className="block truncate text-xs text-ink-muted" title={[row.gradeLevel, row.email].filter(Boolean).join(' · ')}>{row.gradeLevel || 'No grade'}{row.email ? ` · ${row.email}` : ''}</span></td>
            <td className="truncate px-3 py-2.5 tabular-nums">{row.studentCode || <span className="text-ink-subtle">—</span>}</td>
            <td className="px-3 py-2.5"><Badge tone={statusTone[row.status]}>{previewStatusLabel(row.status)}</Badge></td>
            <td className="px-3 py-2.5"><RowNotes row={row} /></td>
          </tr>)}</tbody>
        </table>
      </div>
      <ul className="divide-y divide-line rounded-md border border-line md:hidden">{visible.map(row => <li key={row.row} className={cn('px-3 py-3', row.status === 'needs_review' && 'bg-danger-soft/40')}>
        <div className="flex items-start justify-between gap-3">
          <p className="min-w-0 font-medium text-ink [overflow-wrap:anywhere]">{[row.firstName, row.lastName].filter(Boolean).join(' ') || 'No name'}</p>
          <Badge tone={statusTone[row.status]} className="shrink-0">{previewStatusLabel(row.status)}</Badge>
        </div>
        <p className="mt-0.5 text-xs text-ink-muted [overflow-wrap:anywhere]">Row {row.row} · {row.studentCode || 'no student code'} · {row.gradeLevel || 'no grade'}{row.email ? ` · ${row.email}` : ''}</p>
        <RowNotes row={row} className="mt-1.5" />
      </li>)}</ul>
    </>}
  </div>;
}

function RowNotes({ row, className }: { row: PreviewRow; className?: string }) {
  if (!row.errors.length && !row.warnings.length) return row.status === 'already_in_class' ? <span className={cn('text-xs text-ink-muted', className)}>No change</span> : null;
  return <ul className={cn('space-y-0.5 text-xs', className)}>
    {row.errors.map(message => <li key={message} className="text-danger">{message}</li>)}
    {row.warnings.map(message => <li key={message} className="text-warn">{message === 'Profile data differs from CSV.' ? 'Their school record differs from this file. The record is kept.' : message}</li>)}
  </ul>;
}

function Results({ result, classroomName, summaryRef }: { result: ApiClassroomStudentImportResult; classroomName: string; summaryRef: (node: HTMLElement | null) => void }) {
  const added = addedCount(result);
  const failed = result.results.filter(item => item.status === 'failed');
  return <div className="space-y-4">
    <div ref={summaryRef} tabIndex={-1} role="status" className={cn('border-l-4 p-4 text-sm focus-visible:outline-none', added > 0 ? 'border-ok bg-ok-soft' : 'border-danger bg-danger-soft')}>
      <p className={cn('font-semibold', added > 0 ? 'text-ok' : 'text-danger')}>{added > 0 ? `${plural(added, 'student')} added to ${classroomName}` : 'No students were added'}</p>
      <ul className="mt-1.5 space-y-0.5 text-ink">
        {result.createdAndAdded > 0 && <li>{plural(result.createdAndAdded, 'new student')} got a school account</li>}
        {result.existingAdded > 0 && <li>{plural(result.existingAdded, 'student')} already in your school joined the class</li>}
        {result.unchanged > 0 && <li>{plural(result.unchanged, 'student was', 'students were')} already in this class</li>}
        {result.failed > 0 && <li>{plural(result.failed, 'row')} couldn’t be added</li>}
      </ul>
    </div>
    {failed.length > 0 && <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-ink">Rows to fix</h3>
        <Button size="sm" variant="secondary" onClick={() => downloadText('vista-rows-to-fix.csv', failedRowsCsv(result.results))} icon={<DownloadIcon className="h-4 w-4" aria-hidden />}>Download as CSV</Button>
      </div>
      <ul className="mt-2 max-h-72 divide-y divide-line overflow-y-auto rounded-md border border-line">{failed.map(item => <li key={item.row} className="px-3 py-2.5 text-sm">
        <p className="text-ink"><span className="tabular-nums text-ink-muted">Row {item.row}</span> · <span className="font-medium [overflow-wrap:anywhere]">{item.name || 'No name'}</span>{item.studentCode && <span className="text-ink-muted"> · {item.studentCode}</span>}</p>
        <p className="mt-0.5 text-danger">{item.message ?? 'This row couldn’t be added.'}</p>
      </li>)}</ul>
    </div>}
  </div>;
}
