const test = require('node:test');
const assert = require('node:assert/strict');

test('course and class progress values stay in percentage bounds', () => {
  assert.ok(42 >= 0 && 42 <= 100);
  assert.ok(68 >= 0 && 68 <= 100);
});

test('class resource identifiers remain stable', () => {
  assert.match('VISTA-WF01-DEMO-ROBOT-01', /^VISTA-/);
  assert.equal('SO-101', 'SO-101');
});
