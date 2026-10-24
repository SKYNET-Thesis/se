import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { PageHeader } from '../components/ui/PageHeader';
import { useSupabaseSession } from '../contexts/SupabaseSessionContext';
import { learnerApi } from '../lib/api';
import { studentLearningKeys } from '../queries/studentLearningQueries';

export function MyLearning() {
  const { session }=useSupabaseSession(); const token=session?.access_token??''; const navigate=useNavigate();
  const query=useQuery({queryKey:studentLearningKeys.list(),queryFn:()=>learnerApi.myLearning(token),enabled:Boolean(token),staleTime:30_000});
  return <main className="mx-auto max-w-5xl px-5 py-8 sm:px-8"><PageHeader title="My Learning" description="Learning assigned through your active classroom membership." />{query.error&&<p role="alert" className="mt-6 bg-danger-soft p-3 text-sm text-danger">{query.error instanceof Error?query.error.message:'Unable to load learning.'}</p>}{!query.isLoading&&!query.error&&!query.data?.length&&<div className="mt-8"><EmptyState title="No assigned learning" description="Your teacher has not published learning for your classrooms yet." /></div>}<div className="mt-8 space-y-3">{query.data?.map(item=><article key={item.classroom_assignment_id} className="flex flex-wrap items-center justify-between gap-4 bg-[#edf1ed] p-5"><div><p className="text-sm text-ink-muted">{item.course_title} · {item.classroom_name}</p><h2 className="mt-1 text-xl font-semibold text-ink">{item.title}</h2><p className="mt-1 text-sm capitalize text-ink-muted">{item.learning_status.replace('_',' ')}</p></div><Button onClick={()=>navigate(`/my-learning/${item.classroom_assignment_id}`)}>View assignment</Button></article>)}</div></main>;
}
