import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { PageHeader } from '../components/ui/PageHeader';
import { useSupabaseSession } from '../contexts/SupabaseSessionContext';
import { learnerApi, type ApiMyLearning } from '../lib/api';

export function MyLearning() {
  const { session } = useSupabaseSession(); const token = session?.access_token ?? ''; const navigate = useNavigate(); const [items,setItems]=useState<ApiMyLearning[]>([]); const [error,setError]=useState<string|null>(null);
  const load=()=>void learnerApi.myLearning(token).then(setItems).catch((e:unknown)=>setError(e instanceof Error?e.message:'Unable to load learning.'));
  useEffect(load,[token]);
  const open=async(item:ApiMyLearning)=>{ try { const attempt=item.attempt_id ? { id:item.attempt_id } : await learnerApi.createAttempt(item.classroom_assignment_id,token); navigate(`/practice/${attempt.id}`); } catch(e) { setError(e instanceof Error?e.message:'Unable to start learning.'); } };
  return <main className="mx-auto max-w-5xl px-5 py-8 sm:px-8"><PageHeader title="My Learning" description="Learning assigned through your active classroom membership." />{error&&<p role="alert" className="mt-6 bg-danger-soft p-3 text-sm text-danger">{error}</p>}{!error&&!items.length&&<div className="mt-8"><EmptyState title="No assigned learning" description="Your teacher has not published learning for your classrooms yet." /></div>}<div className="mt-8 space-y-3">{items.map(item=><article key={item.classroom_assignment_id} className="flex flex-wrap items-center justify-between gap-4 bg-[#edf1ed] p-5"><div><p className="text-sm text-ink-muted">{item.course_title} · {item.classroom_name}</p><h2 className="mt-1 text-xl font-semibold text-ink">{item.title}</h2><p className="mt-1 text-sm text-ink-muted">{item.learning_status}</p></div><Button onClick={()=>void open(item)}>{item.attempt_id?'Continue':'Start'}</Button></article>)}</div></main>;
}
