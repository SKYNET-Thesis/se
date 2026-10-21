import React from 'react';
import { PlusIcon, Trash2Icon } from 'lucide-react';
import type { Criterion, CriterionCheck } from '../../types/learning';
import type { RobotOp, ZoneId } from '../../types/robotProgram';
import { sceneObjects, sceneZones } from '../../data/simulationScene';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import { inputClasses } from '../ui/Field';
import { createId } from '../../utils/id';

const CHECK_KINDS: Array<{value: CriterionCheck['kind'];label: string;}> = [
{ value: 'no_errors', label: 'Program validates' },
{ value: 'uses_op', label: 'Uses a block' },
{ value: 'run_completes', label: 'Simulation completes' },
{ value: 'object_in_zone', label: 'Object ends in zone' },
{ value: 'manual', label: 'Teacher judgement' }];


const OPS: Array<{value: RobotOp;label: string;}> = [
{ value: 'move_to', label: 'Move Arm to Position' },
{ value: 'move_joint', label: 'Move Joint' },
{ value: 'move_home', label: 'Move Home' },
{ value: 'gripper', label: 'Gripper' },
{ value: 'wait', label: 'Wait' },
{ value: 'repeat', label: 'Repeat' },
{ value: 'if', label: 'If / Else' },
{ value: 'move_both', label: 'Move Both Arms' },
{ value: 'sync', label: 'Wait for Both Arms' }];


function defaultCheck(kind: CriterionCheck['kind']): CriterionCheck {
  switch (kind) {
    case 'uses_op':
      return { kind, op: 'move_to' };
    case 'object_in_zone':
      return { kind, objectId: 'red', zone: 'A' };
    default:
      return { kind } as CriterionCheck;
  }
}

interface CriteriaEditorProps {
  criteria: Criterion[];
  onChange: (criteria: Criterion[]) => void;
  error?: string;
}

export function CriteriaEditor({ criteria, onChange, error }: CriteriaEditorProps) {
  const update = (id: string, patch: Partial<Criterion>) => onChange(criteria.map((c) => c.id === id ? { ...c, ...patch } : c));
  const selectCls = `${inputClasses} h-9 py-0`;

  return (
    <fieldset>
      <legend className="text-[13px] font-medium text-ink">Completion criteria</legend>
      <p className="mt-0.5 text-xs text-ink-subtle">Automatic checks run in the Studio; teacher-judgement criteria appear during review.</p>
      <ul className="mt-3 space-y-2">
        {criteria.map((c, i) =>
        <li key={c.id} className="grid gap-2 rounded-md border border-line p-2.5 md:grid-cols-[1fr_190px_auto]">
            <input
            aria-label={`Criterion ${i + 1} description`}
            className={`${inputClasses} h-9 py-0`}
            value={c.text}
            placeholder="e.g. Red cube ends in Bin A"
            onChange={(e) => update(c.id, { text: e.target.value })} />
          
            <select aria-label={`Criterion ${i + 1} check type`} className={selectCls} value={c.check.kind} onChange={(e) => update(c.id, { check: defaultCheck(e.target.value as CriterionCheck['kind']) })}>
              {CHECK_KINDS.map((k) =>
            <option key={k.value} value={k.value}>
                  {k.label}
                </option>
            )}
            </select>
            <IconButton label={`Remove criterion ${i + 1}`} className="hover:bg-danger-soft hover:text-danger" onClick={() => onChange(criteria.filter((x) => x.id !== c.id))}>
              <Trash2Icon />
            </IconButton>
            {c.check.kind === 'uses_op' &&
          <select aria-label="Required block" className={`${selectCls} md:col-span-2`} value={c.check.op} onChange={(e) => update(c.id, { check: { kind: 'uses_op', op: e.target.value as RobotOp } })}>
                {OPS.map((o) =>
            <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
            )}
              </select>
          }
            {c.check.kind === 'object_in_zone' &&
          <div className="grid grid-cols-2 gap-2 md:col-span-2">
                <select
              aria-label="Object"
              className={selectCls}
              value={c.check.objectId}
              onChange={(e) => c.check.kind === 'object_in_zone' && update(c.id, { check: { ...c.check, objectId: e.target.value } })}>
              
                  {sceneObjects.map((o) =>
              <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
              )}
                </select>
                <select
              aria-label="Zone"
              className={selectCls}
              value={c.check.zone}
              onChange={(e) => c.check.kind === 'object_in_zone' && update(c.id, { check: { ...c.check, zone: e.target.value as ZoneId } })}>
              
                  {sceneZones.map((z) =>
              <option key={z.id} value={z.id}>
                      {z.label}
                    </option>
              )}
                </select>
              </div>
          }
          </li>
        )}
      </ul>
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
      <Button size="sm" variant="ghost" className="mt-2" icon={<PlusIcon className="h-4 w-4" />} onClick={() => onChange([...criteria, { id: createId('c'), text: '', check: { kind: 'no_errors' } }])}>
        Add criterion
      </Button>
    </fieldset>);

}