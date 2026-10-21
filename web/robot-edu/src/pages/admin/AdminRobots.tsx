import React, { useState } from 'react';
import { CpuIcon, PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { toast } from 'sonner';
import type { RobotResource } from '../../types/user';
import { useAdmin } from '../../contexts/AdminContext';
import { RobotFormDialog } from '../../components/admin/RobotFormDialog';
import { PageHeader } from '../../components/ui/PageHeader';
import { DemoNotice } from '../../components/ui/DemoNotice';
import { Button } from '../../components/ui/Button';
import { IconButton } from '../../components/ui/IconButton';
import { Badge } from '../../components/ui/Badge';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { EmptyState } from '../../components/ui/EmptyState';
import { SectionHeading } from '../../components/ui/SectionHeading';
import { REAL_ROBOT_INTEGRATION } from '../../utils/robot/realRobotAdapter';

export function AdminRobots() {
  const { robots, upsertRobot, removeRobot } = useAdmin();
  const [form, setForm] = useState<{open: boolean;robot: RobotResource | null;}>({ open: false, robot: null });
  const [toRemove, setToRemove] = useState<RobotResource | null>(null);

  return (
    <div className="mx-auto w-full max-w-[1180px] px-4 py-6 md:px-8 md:py-9">
      <PageHeader
        title="Robot resources"
        description="Register lab robots and track their integration stage."
        actions={
        <Button variant="primary" icon={<PlusIcon className="h-4 w-4" />} onClick={() => setForm({ open: true, robot: null })}>
            Register robot
          </Button>
        } />
      
      <DemoNotice className="mt-6">Registry entries are demo data in this browser. Live status appears only after a verified robot control backend is connected.</DemoNotice>

      {robots.length === 0 ?
      <EmptyState icon={<CpuIcon />} title="No robots registered" /> :

      <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs text-ink-subtle">
                <th className="py-2 pr-4 font-medium">Robot</th>
                <th className="py-2 pr-4 font-medium">Location</th>
                <th className="py-2 pr-4 font-medium">Integration</th>
                <th className="py-2 pr-4 font-medium">Live status</th>
                <th className="py-2 pr-4 font-medium">Notes</th>
                <th className="py-2" aria-label="Actions" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {robots.map((r) =>
            <tr key={r.id}>
                  <td className="py-3 pr-4">
                    <p className="font-medium text-ink">{r.name}</p>
                    <p className="text-xs text-ink-subtle">{r.model}</p>
                  </td>
                  <td className="py-3 pr-4 text-ink-muted">{r.location}</td>
                  <td className="py-3 pr-4">
                    <Badge tone={r.integration === 'pending_verification' ? 'warn' : 'outline'}>{r.integration === 'pending_verification' ? 'Pending verification' : 'Not configured'}</Badge>
                  </td>
                  <td className="py-3 pr-4 text-ink-muted">Unknown</td>
                  <td className="max-w-[240px] truncate py-3 pr-4 text-ink-muted">{r.notes || '—'}</td>
                  <td className="py-3 text-right">
                    <div className="inline-flex">
                      <IconButton label={`Edit ${r.name}`} size="sm" onClick={() => setForm({ open: true, robot: r })}>
                        <PencilIcon />
                      </IconButton>
                      <IconButton label={`Remove ${r.name}`} size="sm" className="hover:bg-danger-soft hover:text-danger" onClick={() => setToRemove(r)}>
                        <Trash2Icon />
                      </IconButton>
                    </div>
                  </td>
                </tr>
            )}
            </tbody>
          </table>
        </div>
      }

      <section className="mt-12 max-w-3xl">
        <SectionHeading title="Hardware execution" />
        <p className="text-[14px] leading-relaxed text-ink-muted">{REAL_ROBOT_INTEGRATION.reason} The frontend sends only structured RobotProgram commands; limits, emergency stop and authorisation must be enforced by the robot controller and independent hardware safeguards.</p>
      </section>

      <RobotFormDialog
        open={form.open}
        robot={form.robot}
        onClose={() => setForm({ open: false, robot: null })}
        onSave={(r) => {
          upsertRobot(r);
          setForm({ open: false, robot: null });
          toast.success('Robot resource saved');
        }} />
      
      <ConfirmDialog
        open={toRemove !== null}
        title={`Remove ${toRemove?.name}?`}
        description="This removes the registry entry from this browser."
        confirmLabel="Remove"
        onCancel={() => setToRemove(null)}
        onConfirm={() => {
          if (toRemove) removeRobot(toRemove.id);
          setToRemove(null);
          toast.success('Robot resource removed');
        }} />
      
    </div>);

}