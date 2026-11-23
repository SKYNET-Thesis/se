import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { SearchXIcon } from 'lucide-react';
import { catalogApi, type ApiCatalogCourse } from '../lib/api';
import { useSupabaseSession } from '../contexts/SupabaseSessionContext';
import { EmptyState } from '../components/ui/EmptyState';
import { LEVEL_LABEL, LevelBadge, TagChips, isAcademicLevel } from '../components/academic/LevelBadge';

/** School catalog: courses of the student's own school that the school opened for self-enrollment. Enrollment is checked again by the server. */
export function CourseCatalog() {
  const { session } = useSupabaseSession();
  const token = session?.access_token;
  const [level, setLevel] = useState(''); const [tag, setTag] = useState(''); const [q, setQ] = useState('');
  const [items, setItems] = useState<ApiCatalogCourse[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!token) return;
    setError(null);
    catalogApi.courseCatalog(token, { level, tag, q }).then((result) => setItems(result.items)).catch((e: unknown) => setError(e instanceof Error ? e.message : 'Could not load the course catalog.'));
  }, [token, level, tag, q]);
  useEffect(() => { load(); }, [load]);

  const enroll = async (course: ApiCatalogCourse) => {
    if (!token || busy) return;
    setBusy(course.classroomId); setNotice(null);
    try { await catalogApi.enrollInCourse(course.classroomId, token); setNotice({ tone: 'ok', text: `You are enrolled in ${course.title}.` }); load(); }
    catch (e) { setNotice({ tone: 'error', text: e instanceof Error ? e.message : 'Enrollment failed.' }); load(); }   // refresh: the course may have just filled up or closed
    finally { setBusy(null); }
  };

  const tags = [...new Set((items ?? []).flatMap((course) => course.tags))].sort((a, b) => a.localeCompare(b));
  return <main className="mx-auto w-full max-w-[1100px] px-4 py-6 md:px-8 md:py-9">
    <h1 className="text-2xl font-semibold tracking-[-0.02em] text-ink">Course catalog</h1>
    <p className="mt-1 text-sm text-ink-muted">Courses your school has opened for enrollment. Beginner courses need no robot and no AI model.</p>
    <div className="mt-4 flex flex-wrap items-end gap-3" role="group" aria-label="Catalog filters">
      <label className="text-sm text-ink-muted">Search<input aria-label="Search catalog" value={q} onChange={(e) => setQ(e.target.value)} className="ml-1 rounded-lg border border-line bg-surface px-2 py-1.5" /></label>
      <label className="text-sm text-ink-muted">Level<select aria-label="Catalog level" value={level} onChange={(e) => setLevel(e.target.value)} className="ml-1 rounded-lg border border-line bg-surface px-2 py-1.5"><option value="">All levels</option>{Object.entries(LEVEL_LABEL).map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></label>
      <label className="text-sm text-ink-muted">Tag<select aria-label="Catalog tag" value={tag} onChange={(e) => setTag(e.target.value)} className="ml-1 rounded-lg border border-line bg-surface px-2 py-1.5"><option value="">All tags</option>{tags.map((t) => <option key={t} value={t}>{t}</option>)}{tag && !tags.includes(tag) && <option value={tag}>{tag}</option>}</select></label>
    </div>
    {notice && <p role={notice.tone === 'error' ? 'alert' : 'status'} className={`mt-4 rounded-lg px-3 py-2 text-sm ${notice.tone === 'error' ? 'bg-danger-soft text-danger' : 'bg-[#effaf7] text-accent-ink'}`}>{notice.text}</p>}
    {error && <p role="alert" className="mt-4 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
    {!items && !error && <div className="mt-6 h-32 animate-pulse rounded-xl border border-line bg-sunken/60" aria-busy="true" aria-label="Loading catalog" />}
    {items && items.length === 0 && <div className="mt-6"><EmptyState icon={<SearchXIcon />} title="No courses available" description="Your school has not opened any matching course for enrollment, or you are already enrolled. Ask your school administrator." /></div>}
    {items && items.length > 0 && <ul className="mt-6 grid gap-4 md:grid-cols-2" aria-label="Available courses">{items.map((course) => <li key={course.classroomId} data-eligible={course.eligible} className="rounded-xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-center gap-2"><LevelBadge level={isAcademicLevel(course.level) ? course.level : null} /><span className="text-xs text-ink-subtle">{course.schoolName} · {course.classroomName}</span></div>
      <h2 className="mt-2 text-lg font-semibold text-ink">{course.title}</h2>
      <p className="mt-1 text-sm text-ink-muted">{course.description ?? 'A guided VISTA course.'}</p>
      <div className="mt-2"><TagChips tags={course.tags} /></div>
      {course.prerequisites.length > 0 && <p className="mt-2 text-sm text-ink-muted">Prerequisites: {course.prerequisites.map((p) => `${p.title}${p.completed ? ' ✓' : ''}`).join(', ')}</p>}
      {(() => { const places = [course.seatsLeft, course.offeringSeatsLeft ?? null].filter((n): n is number => n !== null); const left = places.length ? Math.min(...places) : null;
        return left !== null ? <p className="mt-1 text-xs text-ink-subtle">{left} seat{left === 1 ? '' : 's'} left</p> : null; })()}
      {course.eligible && course.enrollmentClosesAt && <p className="mt-1 text-xs text-ink-subtle">Enrollment closes {new Date(course.enrollmentClosesAt).toLocaleString()}</p>}
      {!course.eligible && <p role="note" className="mt-2 text-sm text-ink-muted">{course.reasons.join(' ')}</p>}
      <button type="button" disabled={!course.eligible || busy === course.classroomId} onClick={() => void enroll(course)} className="mt-3 inline-flex h-9 items-center rounded-lg bg-accent px-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{busy === course.classroomId ? 'Enrolling…' : `Enroll in ${course.title}`}</button>
      <Link to="/learning-path" className="ml-3 text-sm font-medium text-accent-ink underline">Learning path</Link>
    </li>)}</ul>}
  </main>;
}
