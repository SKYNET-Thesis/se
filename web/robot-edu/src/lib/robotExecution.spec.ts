import { describe, expect, it } from 'vitest';
import { assertPhysicalExecutionEligible } from './robotExecution';

describe('physical execution boundary', () => {
  it('rejects learning preview coordinates before any physical client is called', () => {
    expect(() => assertPhysicalExecutionEligible([{ type: 'preview.move_xyz', mode: 'learning_preview', frame: 'learning_preview_v1', arm: 'left', position: { x: 240, y: 220, z: 120 } }])).toThrow('Physical execution rejected');
  });

  it('keeps the existing C1 canonical subset eligible at this browser boundary', () => {
    expect(() => assertPhysicalExecutionEligible([{ type: 'arm.select', arm: 'left' }, { type: 'gripper.open' }])).not.toThrow();
  });
});
