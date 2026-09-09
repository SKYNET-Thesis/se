const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

test('60 Hz sensor renders keep sending latest pose at 20 Hz; release stops sending', () => {
  let now = 0, next = 0, tick, cleanup, dependency, ref;
  const sent = [];
  const hooks = {
    useRef(value) { return ref ??= { current: value }; },
    useEffect(effect, [active]) {
      if (active === dependency) return;
      cleanup?.();
      dependency = active;
      cleanup = effect();
    },
  };
  const context = {
    exports: {}, require: () => hooks,
    setInterval(callback, ms) { tick = callback; next = now + ms; return 1; },
    clearInterval() { tick = undefined; },
  };
  const source = fs.readFileSync(require.resolve('../src/services/usePoseSender.ts'), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText, context);
  const render = (active, pose) => context.exports.usePoseSender(active, () => sent.push(pose));
  for (now = 0; now <= 1000; now++) {
    if (now % 16 === 0) render(true, now);
    if (tick && now >= next) { next += 50; tick(); }
  }
  assert.equal(sent.length, 20);
  assert.equal(sent[0], 48);
  assert.equal(sent[19], 992);
  render(false, 1001);
  assert.equal(tick, undefined);
  render(true, 1002);
  now = next;
  tick();
  assert.equal(sent.at(-1), 1002);
  cleanup();
});
