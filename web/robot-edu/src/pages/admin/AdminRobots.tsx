import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BotIcon, PlusIcon } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { Field, inputClasses } from '../../components/ui/Field';
import { PageHeader } from '../../components/ui/PageHeader';
import { useSupabaseSession } from '../../contexts/SupabaseSessionContext';
import { educationAdminApi, robotRegistryApi, type ApiRobotRegistryItem } from '../../lib/api';

const STATUS_LABEL: Record<string, string> = { available: 'Available', in_use: 'In use', maintenance: 'Disabled (maintenance)', retired: 'Retired' };
const key = ['system-admin', 'robots'] as const;
const message = (error: unknown) => (error instanceof Error ? error.message : 'The request failed.');

/**
 * System Administrator workspace: register logical Robot Resources and manage which organizations are entitled to them.
 * Registration creates no AWS infrastructure, certificate or credential; a resource is never shown as connected or ready here.
 */
export function AdminRobots() {
  const { session } = useSupabaseSession();
  const token = session?.access_token ?? '';
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const list = useQuery({ queryKey: key, queryFn: () => robotRegistryApi.list(token), enabled: Boolean(token) });
  const refresh = () => queryClient.invalidateQueries({ queryKey: key });

  return (
    <div className="mx-auto w-full max-w-[1240px] px-4 py-6 md:px-8 md:py-9">
      <PageHeader
        title="Robot Resources"
        description="Register logical robot resources and grant or revoke organization entitlements. Registering a resource does not create cloud infrastructure, certificates or credentials, and does not make it ready for use."
        actions={<Button variant="primary" icon={<PlusIcon className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>Add robot</Button>}
      />
      {list.isLoading ? <p className="mt-6 text-sm text-ink-muted" role="status">Loading robot resources…</p> : null}
      {list.isError ? <p className="mt-6 text-sm text-danger" role="alert">{message(list.error)}</p> : null}
      {list.isSuccess && list.data.length === 0 ? <p className="mt-6 text-sm text-ink-muted">No robot resources are registered.</p> : null}
      {list.isSuccess && list.data.length > 0 ? (
        <div className="mt-6 overflow-x-auto rounded-lg border border-line">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Registered robot resources</caption>
            <thead className="bg-sunken text-xs text-ink-muted"><tr><th className="p-3">Name</th><th className="p-3">Serial</th><th className="p-3">Model</th><th className="p-3">Status</th><th className="p-3">Entitled orgs</th><th className="p-3">Allocations</th><th className="p-3">Open sessions</th><th className="p-3"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {list.data.map((robot: ApiRobotRegistryItem) => (
                <tr key={robot.id} className="border-t border-line">
                  <td className="p-3 font-medium text-ink"><BotIcon className="mr-2 inline h-4 w-4 text-ink-muted" aria-hidden="true" />{robot.name}</td>
                  <td className="whitespace-nowrap p-3 font-mono text-[13px] text-ink-muted">{robot.serialNo}</td>
                  <td className="whitespace-nowrap p-3 text-ink-muted">{robot.modelName}</td>
                  <td className="p-3">{STATUS_LABEL[robot.status] ?? robot.status}{!robot.commissioned ? <span className="ml-2 text-xs text-ink-muted">Not commissioned</span> : null}</td>
                  <td className="p-3">{robot.activeEntitlements}</td>
                  <td className="p-3">{robot.allocations}</td>
                  <td className="p-3">{robot.openLabSessions}</td>
                  <td className="p-3 text-right"><Button variant="secondary" onClick={() => setSelectedId(robot.id)}>Manage</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {createOpen ? <CreateRobotDialog token={token} onClose={() => setCreateOpen(false)} onDone={async () => { setCreateOpen(false); await refresh(); }} /> : null}
      {selectedId ? <RobotDetailDialog token={token} robotId={selectedId} onClose={() => setSelectedId('')} onChanged={refresh} /> : null}
    </div>
  );
}

function CreateRobotDialog({ token, onClose, onDone }: { token: string; onClose: () => void; onDone: () => Promise<void> }) {
  const [form, setForm] = useState({ serialNo: '', name: '', modelName: 'SO-101', firmwareVersion: '', notes: '' });
  const create = useMutation({
    mutationFn: () => robotRegistryApi.create(token, { serialNo: form.serialNo.trim(), name: form.name.trim(), modelName: form.modelName.trim() || undefined, firmwareVersion: form.firmwareVersion.trim() || undefined, notes: form.notes.trim() || undefined }),
    onSuccess: onDone,
  });
  const set = (name: keyof typeof form) => (event: { target: { value: string } }) => setForm((current) => ({ ...current, [name]: event.target.value }));
  return (
    <Dialog
      open
      onClose={onClose}
      title="Add robot resource"
      description="Registers a logical resource only. Device commissioning (certificate, Edge runtime) is a separate, owner-approved operation."
      footer={(<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="primary" disabled={create.isPending || form.serialNo.trim().length < 3 || form.name.trim().length < 2} onClick={() => create.mutate()}>Add robot</Button></>)}
    >
      <div className="space-y-3">
        <Field label="Serial number">{(p) => <input {...p} className={inputClasses} value={form.serialNo} onChange={set('serialNo')} maxLength={64} />}</Field>
        <Field label="Name">{(p) => <input {...p} className={inputClasses} value={form.name} onChange={set('name')} maxLength={120} />}</Field>
        <Field label="Model">{(p) => <input {...p} className={inputClasses} value={form.modelName} onChange={set('modelName')} maxLength={60} />}</Field>
        <Field label="Firmware version (optional)">{(p) => <input {...p} className={inputClasses} value={form.firmwareVersion} onChange={set('firmwareVersion')} maxLength={60} />}</Field>
        <Field label="Notes (optional)">{(p) => <textarea {...p} className={inputClasses} rows={2} value={form.notes} onChange={set('notes')} maxLength={1000} />}</Field>
        {create.isError ? <p role="alert" className="text-sm text-danger">{message(create.error)}</p> : null}
      </div>
    </Dialog>
  );
}

function RobotDetailDialog({ token, robotId, onClose, onChanged }: { token: string; robotId: string; onClose: () => void; onChanged: () => Promise<unknown> }) {
  const queryClient = useQueryClient();
  const [orgId, setOrgId] = useState('');
  const [edit, setEdit] = useState<{ name: string; modelName: string; firmwareVersion: string; notes: string } | null>(null);
  const detail = useQuery({ queryKey: [...key, robotId], queryFn: () => robotRegistryApi.detail(robotId, token) });
  const orgs = useQuery({ queryKey: ['system-admin', 'organizations'], queryFn: () => educationAdminApi.managedOrganizations(token) });
  const refresh = async () => { await queryClient.invalidateQueries({ queryKey: key }); await onChanged(); };
  const act = useMutation({ mutationFn: (action: () => Promise<unknown>) => action(), onSuccess: refresh });
  const data = detail.data;
  return (
    <Dialog open onClose={onClose} title={data ? `${data.name} · ${data.serialNo}` : 'Robot resource'} size="lg">
      {detail.isLoading ? <p className="text-sm text-ink-muted" role="status">Loading…</p> : null}
      {detail.isError ? <p role="alert" className="text-sm text-danger">{message(detail.error)}</p> : null}
      {data ? (
        <div className="space-y-5 text-sm">
          <section aria-label="Operational status">
            <p className="text-ink">Status: <strong>{STATUS_LABEL[data.status] ?? data.status}</strong>{!data.commissioned ? ' · not commissioned, runtime connectivity not reported' : ''}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {data.status !== 'available' && data.status !== 'retired' ? <Button variant="secondary" disabled={act.isPending} onClick={() => act.mutate(() => robotRegistryApi.update(robotId, token, { status: 'available' }))}>Enable</Button> : null}
              {data.status === 'available' ? <Button variant="secondary" disabled={act.isPending} onClick={() => { if (window.confirm('Disable this robot? Open Lab Sessions are ended through controlled termination.')) act.mutate(() => robotRegistryApi.update(robotId, token, { status: 'maintenance' })); }}>Disable</Button> : null}
              {data.status !== 'retired' ? <Button variant="secondary" disabled={act.isPending} onClick={() => { if (window.confirm('Retire this robot? History is kept; it can no longer be allocated.')) act.mutate(() => robotRegistryApi.update(robotId, token, { status: 'retired' })); }}>Retire</Button> : null}
            </div>
          </section>
          <section aria-label="Details">
            <h3 className="font-semibold text-ink">Details</h3>
            {edit ? (
              <div className="mt-2 space-y-2">
                <Field label="Name">{(p) => <input {...p} className={inputClasses} value={edit.name} onChange={(event) => setEdit({ ...edit, name: event.target.value })} maxLength={120} />}</Field>
                <Field label="Model">{(p) => <input {...p} className={inputClasses} value={edit.modelName} onChange={(event) => setEdit({ ...edit, modelName: event.target.value })} maxLength={60} />}</Field>
                <Field label="Firmware version">{(p) => <input {...p} className={inputClasses} value={edit.firmwareVersion} onChange={(event) => setEdit({ ...edit, firmwareVersion: event.target.value })} maxLength={60} />}</Field>
                <Field label="Notes">{(p) => <textarea {...p} className={inputClasses} rows={2} value={edit.notes} onChange={(event) => setEdit({ ...edit, notes: event.target.value })} maxLength={1000} />}</Field>
                <div className="flex gap-2">
                  <Button variant="primary" disabled={act.isPending || edit.name.trim().length < 2} onClick={() => act.mutate(async () => { await robotRegistryApi.update(robotId, token, { name: edit.name.trim(), modelName: edit.modelName.trim() || undefined, firmwareVersion: edit.firmwareVersion.trim() || undefined, notes: edit.notes.trim() || undefined }); setEdit(null); })}>Save details</Button>
                  <Button variant="secondary" onClick={() => setEdit(null)}>Cancel</Button>
                </div>
              </div>
            ) : (
              <div className="mt-2 flex items-center justify-between gap-3">
                <p className="text-ink-muted">{data.modelName}{data.firmwareVersion ? ` · firmware ${data.firmwareVersion}` : ''}{data.notes ? ` · ${data.notes}` : ''}</p>
                <Button variant="secondary" onClick={() => setEdit({ name: data.name, modelName: data.modelName, firmwareVersion: data.firmwareVersion ?? '', notes: data.notes ?? '' })}>Edit details</Button>
              </div>
            )}
          </section>
          <section aria-label="Entitlements">
            <h3 className="font-semibold text-ink">Organization entitlements</h3>
            <ul className="mt-2 space-y-1">
              {data.entitlements.length === 0 ? <li className="text-ink-muted">No organization is entitled to this robot.</li> : null}
              {data.entitlements.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-3">
                  <span>{item.organizationName} · {item.active ? 'active' : 'ended'} · from {new Date(item.validFrom).toLocaleDateString()}{item.validTo ? ` to ${new Date(item.validTo).toLocaleDateString()}` : ''}</span>
                  {item.active ? <Button variant="secondary" disabled={act.isPending} onClick={() => { if (window.confirm(`Revoke ${item.organizationName}'s entitlement? New runs stop immediately and an open Lab Session ends safely.`)) act.mutate(() => robotRegistryApi.revokeEntitlement(robotId, item.id, token)); }}>Revoke</Button> : null}
                </li>
              ))}
            </ul>
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <Field label="Grant to organization">
                {(p) => (
                  <select {...p} className={inputClasses} value={orgId} onChange={(event) => setOrgId(event.target.value)}>
                    <option value="">Select an organization</option>
                    {(orgs.data ?? []).map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}
                  </select>
                )}
              </Field>
              <Button variant="primary" disabled={!orgId || act.isPending} onClick={() => act.mutate(async () => { await robotRegistryApi.grantEntitlement(robotId, token, orgId); setOrgId(''); })}>Grant entitlement</Button>
            </div>
          </section>
          <section aria-label="Allocations">
            <h3 className="font-semibold text-ink">Classroom allocations (read only)</h3>
            <ul className="mt-2 space-y-1">
              {data.allocations.length === 0 ? <li className="text-ink-muted">Not allocated to any classroom.</li> : null}
              {data.allocations.map((item) => <li key={item.id}>{item.organizationName} · {item.classroomName}</li>)}
            </ul>
            {data.openLabSessions.length > 0 ? <p className="mt-2 text-ink-muted">{data.openLabSessions.length} open Lab Session(s).</p> : null}
          </section>
          {act.isError ? <p role="alert" className="text-danger">{message(act.error)}</p> : null}
        </div>
      ) : null}
    </Dialog>
  );
}
