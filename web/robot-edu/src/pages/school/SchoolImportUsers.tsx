import React, { useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { DownloadIcon, FileUpIcon, SearchIcon, ShieldAlertIcon } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { useNavigate } from 'react-router-dom';
import { useSupabaseSession } from '../../contexts/SupabaseSessionContext';
import { useRole } from '../../contexts/RoleContext';
import { educationAdminApi, type ApiSchoolImportResult } from '../../lib/api';
import { importInvalidations } from '../../queries/schoolAdminQueries';
import { importResultView } from '../../utils/importResult';
import { filterImportRows, importSummary, parseSchoolCsv, rowStatus, template, type ImportKind, type ImportRow, type ImportStatus } from '../../utils/schoolImport';

const PAGE_SIZE = 10;
const dash = (value?: string) => value || '—';

export function SchoolImportUsers() {
  const navigate = useNavigate(); const { session } = useSupabaseSession(); const { memberships } = useRole(); const queryClient = useQueryClient(); const token = session?.access_token ?? '';
  const [kind, setKind] = useState<ImportKind>('teachers');
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [reviewOpen, setReviewOpen] = useState(false);
  const [filter, setFilter] = useState<'All' | ImportStatus>('All');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const organizationId = memberships.find(item => item.roleCode === 'school_admin' && item.status === 'active')?.organizationId ?? '';
  const [provisioning, setProvisioning] = useState(false);
  const [result, setResult] = useState<ApiSchoolImportResult | null>(null);
  const [provisionError, setProvisionError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const summary = useMemo(() => importSummary(rows), [rows]);
  const filteredRows = useMemo(() => filterImportRows(rows, filter, query), [rows, filter, query]);
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const visibleRows = filteredRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const noun = kind === 'students' ? 'student' : 'teacher';
  const resetReviewControls = () => { setFilter('All'); setQuery(''); setPage(1); };
  const switchKind = (next: ImportKind) => { setKind(next); setRows([]); setFileName(''); setResult(null); setProvisionError(null); setReviewOpen(false); resetReviewControls(); };
  const chooseAnother = () => { setRows([]); setFileName(''); setResult(null); setProvisionError(null); setReviewOpen(false); resetReviewControls(); if (fileRef.current) fileRef.current.value = ''; };
  const upload = async (file: File) => { setFileName(file.name); setRows(parseSchoolCsv(kind, await file.text())); setResult(null); setProvisionError(null); resetReviewControls(); setReviewOpen(true); };
  const download = () => { const link = document.createElement('a'); const url = URL.createObjectURL(new Blob([template(kind)], { type: 'text/csv' })); link.href = url; link.download = `vista-${kind}-template.csv`; link.click(); URL.revokeObjectURL(url); };
  const updateFilter = (next: 'All' | ImportStatus) => { setFilter(next); setPage(1); };
  const updateQuery = (next: string) => { setQuery(next); setPage(1); };
  const submitImport = async (targetRows = rows) => { if (!organizationId || !targetRows.length) return; setProvisioning(true); setProvisionError(null); try { const next=await educationAdminApi.importUsers(organizationId, token, { kind, rows: targetRows.map(row => ({ firstName:row.firstName,lastName:row.lastName,email:row.email||undefined,employeeCode:row.employeeCode,studentCode:row.studentCode,gradeLevel:row.gradeLevel,guardianEmail:row.guardianEmail||undefined })) });setResult(next);if(next.created+next.unchanged>0)await Promise.all(importInvalidations(organizationId).map(queryKey=>queryClient.invalidateQueries({queryKey}))); } catch { setProvisionError('Import could not be completed. Please try again.'); } finally { setProvisioning(false); } };
  const retryFailed = () => { const failedRows = new Set(result?.results.filter(item => item.status === 'failed').map(item => item.row) ?? []); setResult(null); void submitImport(rows.filter(row => failedRows.has(row.row))); };
  const resultView = result ? importResultView(result) : null;

  return <main className="mx-auto max-w-6xl px-5 py-8">
    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">School administration</p>
    <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink">Import users</h1>
    <p className="mt-2 max-w-2xl text-ink-muted">Download a school template, validate its CSV locally, then review every record before account provisioning is enabled.</p>
    <div className="mt-7 flex gap-2 border-b border-line" role="tablist" aria-label="Import type">
      {(['teachers', 'students'] as ImportKind[]).map(item => <button key={item} type="button" role="tab" aria-selected={kind === item} onClick={() => switchKind(item)} className={kind === item ? 'border-b-2 border-accent px-4 py-3 text-sm font-semibold text-accent' : 'px-4 py-3 text-sm font-medium text-ink-muted hover:text-ink'}>{item === 'teachers' ? 'Teachers' : 'Students'}</button>)}
    </div>
    <p className="mt-4 text-sm text-ink-muted">{kind === 'students' ? 'Student email is optional. Primary-school students can be managed using their school student code.' : 'Teacher email and employee code are required.'}</p>
    <section className="mt-6 rounded-xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" onClick={download} icon={<DownloadIcon className="h-4 w-4" />}>Download {noun} template</Button>
        <input ref={fileRef} className="hidden" type="file" accept=".csv,text/csv" aria-label="Upload CSV" onChange={event => { const next = event.target.files?.[0]; if (next) void upload(next); }} />
        <Button onClick={() => fileRef.current?.click()} icon={<FileUpIcon className="h-4 w-4" />}>{fileName ? 'Choose another file' : 'Upload CSV'}</Button>
      </div>
      {rows.length > 0 && <div className="mt-5 flex flex-wrap items-end justify-between gap-4 border-t border-line pt-5">
        <div><p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">Uploaded file</p><p className="mt-1 font-medium text-ink">{fileName}</p></div>
        <div className="flex flex-wrap gap-4 text-sm"><Metric label="Records" value={summary.Records} /><Metric label="Ready" value={summary.Ready} tone="text-ok" /><Metric label="Duplicate" value={summary.Duplicate} tone="text-warn" /><Metric label="Needs review" value={summary['Needs review']} tone="text-danger" /></div>
        <div className="flex gap-2"><Button variant="secondary" onClick={() => setReviewOpen(true)}>Review data</Button><Button variant="ghost" onClick={chooseAnother}>Choose another file</Button></div>
      </div>}
    </section>
    <Dialog open={reviewOpen} onClose={() => setReviewOpen(false)} size="xl" title={`Review ${noun} import`} description={<><span>Review and validate {summary.Records} {noun} records before importing them.</span><span className="mt-1 block text-xs">{fileName}</span></>} footer={result && resultView ? resultView.tone === 'failed' ? <><Button variant="secondary" onClick={retryFailed}>Try again</Button><Button onClick={() => setReviewOpen(false)}>Close</Button></> : <><p className="mr-auto self-center text-xs text-ink-muted">{resultView.persistence ? 'All records were saved successfully.' : 'Some records were saved successfully.'}</p>{result.failed > 0 && <Button variant="secondary" onClick={retryFailed}>Retry failed</Button>}<Button variant="secondary" onClick={() => navigate('/school/users')}>View users</Button><Button onClick={() => setReviewOpen(false)}>Done</Button></> : <><p className="mr-auto self-center text-xs text-ink-muted">Ready means the row passed validation. No account has been created yet.</p><Button variant="secondary" onClick={() => setReviewOpen(false)}>Cancel</Button><Button onClick={() => void submitImport()} loading={provisioning} disabled={!organizationId || rows.length === 0 || summary.Ready !== rows.length}>Confirm import</Button></>}>
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><Metric label="Records" value={summary.Records} /><Metric label="Ready" value={summary.Ready} tone="text-ok" /><Metric label="Duplicate" value={summary.Duplicate} tone="text-warn" /><Metric label="Needs review" value={summary['Needs review']} tone="text-danger" /></div>
        <div className="flex flex-col justify-between gap-3 border-y border-line py-3 lg:flex-row lg:items-center">
          <div className="flex flex-wrap gap-1" aria-label="Import row filters">{(['All', 'Ready', 'Duplicate', 'Needs review'] as const).map(item => <button key={item} type="button" onClick={() => updateFilter(item)} className={filter === item ? 'rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white' : 'rounded-md px-3 py-1.5 text-sm text-ink-muted hover:bg-sunken'}>{item} {item === 'All' ? summary.Records : summary[item]}</button>)}</div>
          <label className="flex h-9 max-w-sm items-center gap-2 rounded-md border border-line-strong bg-surface px-3 text-sm text-ink-muted"><SearchIcon className="h-4 w-4" /><span className="sr-only">Search import rows</span><input value={query} onChange={event => updateQuery(event.target.value)} className="w-full bg-transparent outline-none" placeholder={kind === 'students' ? 'Search name, student code or email' : 'Search name, employee code or email'} /></label>
        </div>
        <div className="overflow-x-auto rounded-lg border border-line"><table className="w-full min-w-[1000px] text-left text-sm"><thead className="sticky top-0 bg-sunken text-xs uppercase tracking-wide text-ink-muted"><tr><th className="px-3 py-3">Row</th><th className="px-3 py-3">{kind === 'students' ? 'Student' : 'Teacher'}</th>{kind === 'students' ? <><th className="px-3 py-3">Student code</th><th className="px-3 py-3">Grade</th><th className="px-3 py-3">Email</th><th className="px-3 py-3">Guardian email</th></> : <><th className="px-3 py-3">Employee code</th><th className="px-3 py-3">Email</th></>}<th className="px-3 py-3">Status</th><th className="px-3 py-3">Issue</th></tr></thead><tbody>{visibleRows.map(row => <ImportTableRow key={row.row} row={row} kind={kind} />)}{visibleRows.length === 0 && <tr><td colSpan={kind === 'students' ? 8 : 6} className="px-3 py-10 text-center text-ink-muted">No records match this filter.</td></tr>}</tbody></table></div>
        <div className="flex items-center justify-end gap-3 text-sm"><Button variant="secondary" size="sm" disabled={page === 1} onClick={() => setPage(current => current - 1)}>Previous</Button><span className="text-ink-muted">Page {page} of {pageCount}</span><Button variant="secondary" size="sm" disabled={page === pageCount} onClick={() => setPage(current => current + 1)}>Next</Button></div>
        {provisionError && <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{provisionError}</p>}
        {result && resultView ? <div className={resultView.tone === 'success' ? 'rounded-md bg-ok-soft px-4 py-4 text-sm text-ok' : resultView.tone === 'partial' ? 'rounded-md bg-warn-soft px-4 py-4 text-sm text-warn' : 'rounded-md bg-danger-soft px-4 py-4 text-sm text-danger'}><p className="text-base font-semibold">{resultView.title}</p><p className="mt-1">{resultView.description}</p>{resultView.tone === 'failed' && <p className="mt-1">Please try again. If the problem continues, contact your administrator.</p>}{result.failed > 0 && <div className="mt-4 space-y-2 border-t border-current/20 pt-3">{result.results.filter(item => item.status === 'failed').map(item => <div key={item.row}><p className="font-medium">{item.name || `Row ${item.row}`}{item.schoolCode ? ` · ${item.schoolCode}` : ''}</p><p className="text-xs opacity-90">{item.message || 'Could not create account. Please try again.'}</p></div>)}</div>}</div> : summary.Ready !== rows.length && <div className="flex items-center gap-2 rounded-md bg-warn-soft px-3 py-2 text-sm text-warn"><ShieldAlertIcon className="h-4 w-4" />Resolve duplicate and review rows before importing.</div>}
      </div>
    </Dialog>
  </main>;
}
function Metric({ label, value, tone = 'text-ink' }: { label: string; value: number; tone?: string }) { return <div><p className={`text-xl font-semibold ${tone}`}>{value}</p><p className="text-xs text-ink-muted">{label}</p></div>; }
function ImportTableRow({ row, kind }: { row: ImportRow; kind: ImportKind }) {
  const status = rowStatus(row); const badge = status === 'Ready' ? 'bg-ok-soft text-ok' : status === 'Duplicate' ? 'bg-warn-soft text-warn' : 'bg-danger-soft text-danger';
  return <tr className="border-t border-line align-top"><td className="px-3 py-3 text-ink-muted">{row.row}</td><td className="px-3 py-3 font-medium text-ink">{dash(row.fullName)}</td>{kind === 'students' ? <><td className="px-3 py-3">{dash(row.studentCode)}</td><td className="px-3 py-3">{dash(row.gradeLevel)}</td><td className="px-3 py-3">{dash(row.email)}</td><td className="px-3 py-3">{dash(row.guardianEmail)}</td></> : <><td className="px-3 py-3">{dash(row.employeeCode)}</td><td className="px-3 py-3">{dash(row.email)}</td></>}<td className="px-3 py-3"><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${badge}`}>{status}</span></td><td className="max-w-xs px-3 py-3 text-ink-muted">{row.errors.join(' ') || '—'}</td></tr>;
}
