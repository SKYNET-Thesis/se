import React, { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleCheckIcon, PlusIcon, RotateCwIcon } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { educationAdminApi, type ApiRobotResource } from '../../lib/api';
import { eligibleRobotsEnabled, robotInvalidations, schoolAdminKeys } from '../../queries/schoolAdminQueries';

export function ClassroomRobotAllocation({ organizationId, classroomId, token, currentRobot }: { organizationId:string; classroomId:string; token:string; currentRobot?:ApiRobotResource|null }) {
  const [robotId,setRobotId]=useState(''); const [error,setError]=useState<string|null>(null); const [open,setOpen]=useState(false); const [allocated,setAllocated]=useState<ApiRobotResource|null>(currentRobot??null); const queryClient=useQueryClient();
  useEffect(()=>setAllocated(currentRobot??null),[currentRobot]);
  const robots=useQuery({queryKey:schoolAdminKeys.eligibleRobots(organizationId,classroomId),queryFn:()=>educationAdminApi.eligibleRobots(classroomId,token),enabled:eligibleRobotsEnabled(open,classroomId)});
  const allocation=useMutation({mutationFn:(nextRobotId:string)=>educationAdminApi.allocateRobot(classroomId,token,nextRobotId),onSuccess:async(_,nextRobotId)=>{const robot=robots.data?.find(item=>item.id===nextRobotId);if(robot)setAllocated(robot);setOpen(false);await Promise.all(robotInvalidations(organizationId,classroomId).map(queryKey=>queryClient.invalidateQueries({queryKey})));},onError:reason=>setError(reason instanceof Error?reason.message:'The robot couldn’t be assigned. Try again.')});
  const selected=robots.data?.find(robot=>robot.id===robotId); const verb=allocated?'Replace':'Assign';
  const openDialog=()=>{setRobotId(allocated?.id??'');setError(null);setOpen(true);};
  return <section aria-labelledby="classroom-robot" className="rounded-[10px] border border-line bg-surface p-5">
    <h2 id="classroom-robot" className="text-base font-semibold text-ink">Robot</h2>
    {error&&<p role="alert" className="mt-3 border-l-4 border-danger bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
    {allocated?<div className="mt-3">
      <div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-ink">{allocated.name}</p><span className="inline-flex items-center gap-1 rounded-full bg-ok-soft px-2 py-0.5 text-xs font-medium text-ok"><CircleCheckIcon className="h-3.5 w-3.5" aria-hidden/>Assigned</span></div>
      {allocated.modelName&&<p className="mt-0.5 text-sm text-ink-muted">{allocated.modelName}</p>}
      {allocated.serialNo&&<dl className="mt-3 flex gap-2 text-sm"><dt className="text-ink-muted">Serial</dt><dd className="font-medium tabular-nums text-ink">{allocated.serialNo}</dd></dl>}
    </div>:<div className="mt-3"><p className="text-sm font-medium text-ink">No robot assigned</p><p className="mt-1 text-sm text-ink-muted">Assign one of your school’s robots to this classroom.</p></div>}
    <Button className="mt-4" size="sm" variant="secondary" onClick={openDialog} icon={allocated?<RotateCwIcon className="h-4 w-4" aria-hidden/>:<PlusIcon className="h-4 w-4" aria-hidden/>}>{verb} robot</Button>
    <Dialog open={open} onClose={()=>setOpen(false)} title={`${verb} robot`} description="Choose a robot your school can use." footer={<><Button variant="secondary" onClick={()=>setOpen(false)}>Cancel</Button><Button variant="primary" onClick={()=>robotId&&allocation.mutate(robotId)} loading={allocation.isPending} disabled={!robotId}>{verb} robot</Button></>}><label className="block text-sm font-medium text-ink">Robot<select value={robotId} onChange={event=>setRobotId(event.target.value)} disabled={robots.isPending} className="mt-2 h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm"><option value="">{robots.isPending?'Loading robots…':'Choose a robot'}</option>{robots.data?.map(robot=><option key={robot.id} value={robot.id}>{robot.name} · {robot.modelName} · {robot.serialNo}</option>)}</select></label>{robots.data?.length===0&&<p className="mt-3 text-sm text-ink-muted">Your school has no robots available to assign.</p>}{selected&&<div className="mt-4 rounded-md bg-sunken p-3 text-sm"><p className="font-medium text-ink">{selected.name}</p><p className="mt-1 text-ink-muted">{selected.modelName} · {selected.serialNo}</p></div>}</Dialog></section>;
}
