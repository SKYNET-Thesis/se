import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveDashboardOverview } from './dashboardOverview.js';
const pair = (side, ready = true) => ({ side, ready, reason: ready ? null : `${side} calibration required` });
test('prioritizes an active teleoperation session over setup guidance', () => {
  const result = deriveDashboardOverview({ pairs: { left: pair('left'), right: pair('right') }, estop: 'ready', session: { state: 'active', mode: 'dual', latencyMs: 18, recording: true } });
  assert.equal(result.state, 'live'); assert.equal(result.title, 'Dual-arm session live'); assert.equal(result.actionLabel, 'Open controls'); assert.equal(result.detail, '18 ms latency · recording');
});
test('blocks motion when the emergency stop is active', () => {
  const result = deriveDashboardOverview({ pairs: { left: pair('left'), right: pair('right') }, estop: 'active', session: null });
  assert.equal(result.state, 'blocked'); assert.equal(result.title, 'Emergency stop active'); assert.equal(result.actionTo, '/settings');
});
test('guides the operator to finish the unavailable arm pair', () => {
  const result = deriveDashboardOverview({ pairs: { left: pair('left'), right: pair('right', false) }, estop: 'ready', session: null });
  assert.equal(result.state, 'attention'); assert.equal(result.title, 'Right pair needs attention'); assert.equal(result.detail, 'right calibration required'); assert.equal(result.actionTo, '/calibration');
});
test('marks the rig ready only when both pairs can start', () => {
  const result = deriveDashboardOverview({ pairs: { left: pair('left'), right: pair('right') }, estop: 'ready', session: null });
  assert.equal(result.state, 'ready'); assert.equal(result.title, 'Rig ready for teleoperation'); assert.equal(result.actionTo, '/dual-arm');
});
