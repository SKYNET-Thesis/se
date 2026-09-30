const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const context = { exports: {} };
vm.runInNewContext(ts.transpileModule(
  fs.readFileSync(require.resolve('../src/services/gripperSlide.ts'), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } },
).outputText, context);
const velocity = context.exports.gripperSlideVelocity;

test('slide up opens, down closes, center holds, speed is bounded', () => {
  assert.equal(velocity(400, 400), 0);
  assert.equal(velocity(400, 390), 0);
  assert.equal(velocity(400, 410), 0);
  assert.equal(velocity(400, 328), .5);
  assert.equal(velocity(400, 472), -.5);
  assert.equal(velocity(400, 0), 1);
  assert.equal(velocity(400, 1000), -1);
  // A new touch starts neutral regardless of its screen location.
  assert.equal(velocity(800, 800), 0);
});
