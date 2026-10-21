import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState } from '../../components/ui/EmptyState';
import { PageHeader } from '../../components/ui/PageHeader';
import { useSupabaseSession } from '../../contexts/SupabaseSessionContext';
import { instructorApi, type ApiTeachingClassroom } from '../../lib/api';

export function TeacherClasses() {
  const { session } = useSupabaseSession(); const [classes, setClasses] = useState<ApiTeachingClassroom[]>([]); const [error, setError] = useState<string | null>(null);
  useEffect(() => { const token = session?.access_token; if (!token) return; void instructorApi.teachingClassrooms(token).then(setClasses).catch((e: unknown) => setError(e instanceof Error ? e.message : 'Unable to load classes.')); }, [session?.access_token]);
  return <main className="mx-auto max-w-6xl px-5 py-8 sm:px-8"><PageHeader title="My Classes" description="Only classrooms where you hold an active teaching assignment are shown." />{error && <p role="alert" className="mt-6 bg-danger-soft p-3 text-sm text-danger">{error}</p>}{!error && classes.length === 0 && <div className="mt-8"><EmptyState title="No teaching assignments" description="Ask your school administrator to add you to a classroom." /></div>}<div className="mt-8 grid gap-4 md:grid-cols-2">{classes.map((item) => <article key={item.id} className="bg-[#edf1ed] p-6"><p className="text-sm text-ink-muted">{item.organization_name}</p><h2 className="mt-8 text-2xl font-semibold tracking-[-.04em] text-ink">{item.name}</h2><p className="mt-1 text-sm text-ink-muted">{item.code}</p><div className="mt-8 flex justify-between text-sm text-ink-muted"><span>{item.student_count} students</span><span>{item.assignment_count} assigned items</span></div><Link className="mt-6 inline-block text-sm font-semibold text-[#176255] underline underline-offset-4" to={`/teacher/classes/${item.id}`}>Open classroom</Link></article>)}</div></main>;
}
