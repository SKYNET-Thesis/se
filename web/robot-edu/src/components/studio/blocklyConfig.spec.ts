import * as Blockly from 'blockly';
import { describe, expect, it } from 'vitest';
import { registerVistaBlocks } from './blocklyConfig';

/**
 * The robot_move_to fields must keep the learning_preview_v1 contract that the backend enforces
 * (integer x 0-600, y 0-400, z 10-300), so a typed value can never make the autosave PATCH fail with a 400.
 */
const CONTRACT = { X: { min: 0, max: 600 }, Y: { min: 0, max: 400 }, Z: { min: 10, max: 300 } } as const;

function moveBlock() {
  registerVistaBlocks();
  const workspace = new Blockly.Workspace();
  return { workspace, block: workspace.newBlock('robot_move_to') };
}
const value = (field: 'X' | 'Y' | 'Z', typed: number) => {
  const { workspace, block } = moveBlock();
  try { block.setFieldValue(typed, field); return block.getFieldValue(field) as number; } finally { workspace.dispose(); }
};

describe('robot_move_to coordinate fields', () => {
  it('start at the documented defaults inside the contract', () => {
    const { workspace, block } = moveBlock();
    expect([block.getFieldValue('X'), block.getFieldValue('Y'), block.getFieldValue('Z')]).toEqual([300, 200, 120]);
    workspace.dispose();
  });

  it.each(['X', 'Y', 'Z'] as const)('%s rounds a decimal to a whole millimetre', (field) => {
    const typed = field === 'Z' ? 120.4 : 240.4;
    const result = value(field, typed);
    expect(Number.isInteger(result)).toBe(true);
    expect(result).toBe(Math.round(typed));
  });

  it.each(['X', 'Y', 'Z'] as const)('%s clamps out-of-range input to the contract bounds and keeps the bounds themselves', (field) => {
    const { min, max } = CONTRACT[field];
    expect(value(field, min - 50)).toBe(min);
    expect(value(field, max + 50)).toBe(max);
    expect(value(field, min)).toBe(min);
    expect(value(field, max)).toBe(max);
  });
});
