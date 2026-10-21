import React from 'react';
import { ShieldAlertIcon } from 'lucide-react';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { REAL_ROBOT_INTEGRATION } from '../../utils/robot/realRobotAdapter';

export function RealRobotDialog({ open, onClose }: {open: boolean;onClose: () => void;}) {
  return (
    <Dialog open={open} onClose={onClose} size="sm" title="Real robot execution is unavailable" footer={<Button onClick={onClose}>Got it</Button>}>
      <div className="space-y-3 text-sm text-ink-muted">
        <div className="flex gap-2.5 rounded-md bg-warn-soft px-3 py-2.5 text-warn">
          <ShieldAlertIcon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>{REAL_ROBOT_INTEGRATION.reason}</p>
        </div>
        <p>Before this can be enabled, the robot control backend must be connected and verified, including:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Authorised sessions approved by a teacher or lab supervisor</li>
          <li>Joint, speed and workspace limits enforced by the robot controller</li>
          <li>Independent hardware emergency stop</li>
        </ul>
        <p>You may inspect a local schematic preview, but it does not simulate physics and it never sends this program to hardware.</p>
      </div>
    </Dialog>);

}
