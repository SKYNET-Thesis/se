import { describe, expect, it } from 'vitest';
import { isModifiedSince, workspaceFingerprint } from './workspaceFingerprint';

const stored = { blocks: { languageVersion: 0, blocks: [{ type: 'robot_start', id: 'a', x: 10, y: 20, next: { block: { type: 'robot_wait', id: 'b', fields: { SECONDS: 1 } } } }] } };
const reserialized = { blocks: { blocks: [{ next: { block: { fields: { SECONDS: 1 }, id: 'b', type: 'robot_wait' } }, y: 20, x: 10, id: 'a', type: 'robot_start' }], languageVersion: 0 } };

describe('workspace dirty tracking', () => {
  it('does not report a reloaded, unedited workspace as modified even when key order differs', () => {
    expect(JSON.stringify(stored)).not.toBe(JSON.stringify(reserialized));
    expect(isModifiedSince(workspaceFingerprint(stored), reserialized)).toBe(false);
  });
  it('still reports genuine edits: changed field, added, removed or moved block', () => {
    const base = workspaceFingerprint(stored);
    expect(isModifiedSince(base, { blocks: { languageVersion: 0, blocks: [{ ...stored.blocks.blocks[0], next: { block: { type: 'robot_wait', id: 'b', fields: { SECONDS: 2 } } } }] } })).toBe(true);
    expect(isModifiedSince(base, { blocks: { languageVersion: 0, blocks: [] } })).toBe(true);
    expect(isModifiedSince(base, { blocks: { languageVersion: 0, blocks: [{ ...stored.blocks.blocks[0], x: 99 }] } })).toBe(true);
    expect(isModifiedSince(base, { blocks: { languageVersion: 0, blocks: [...stored.blocks.blocks, { type: 'robot_gripper_open', id: 'c' }] } })).toBe(true);
  });
  it('has no opinion without a baseline', () => expect(isModifiedSince(null, stored)).toBe(false));
});
