import assert from 'node:assert/strict';
import test from 'node:test';
import { selectRequiredRecordingCameras } from './recordingCameras.js';

test('selects one connected wrist and one connected head camera', () => {
  const result = selectRequiredRecordingCameras([
    { id: 'left-wrist', role: 'left-wrist', connection: 'connected' },
    { id: 'front', role: 'front', connection: 'connected' },
    { id: 'overhead', role: 'overhead', connection: 'connected' },
  ]);

  assert.equal(result.wristCamera?.id, 'left-wrist');
  assert.equal(result.headCamera?.id, 'front');
  assert.equal(result.onlineCount, 2);
  assert.equal(result.ready, true);
});

test('surfaces an offline head camera while blocking recording', () => {
  const result = selectRequiredRecordingCameras([
    { id: 'right-wrist', role: 'right-wrist', connection: 'connected' },
    { id: 'front', role: 'front', connection: 'offline' },
  ]);

  assert.equal(result.wristCamera?.id, 'right-wrist');
  assert.equal(result.headCamera?.id, 'front');
  assert.equal(result.ready, false);
  assert.equal(result.onlineCount, 1);
});
