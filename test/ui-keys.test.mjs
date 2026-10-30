// js/ui-keys.js（Issue #380 段1）：キー→コールバックの対応、無視する条件、登録と解除の1回性、
// sfx の clickSkipped が続くキーの音を消さないこと（sfx.js は変えない）。
import { test } from 'node:test';
import assert from 'node:assert/strict';

class FakeEl {
  constructor(tag, { dataset = {}, disabled = false, attrs = {} } = {}) {
    this.tagName = tag.toUpperCase();
    this.dataset = dataset;
    this.disabled = disabled;
    this.attrs = attrs;
  }
  getAttribute(n) {
    return this.attrs[n] ?? null;
  }
  closest(sel) {
    return this.tagName === 'BUTTON' && sel.includes('button') ? this : null;
  }
  matches() {
    return false;
  }
}
const listeners = {};
globalThis.document = {
  addEventListener(type, fn) {
    (listeners[type] ||= new Set()).add(fn);
  },
  removeEventListener(type, fn) {
    listeners[type]?.delete(fn);
  },
};
globalThis.window = globalThis;
globalThis.Element = FakeEl;
globalThis.localStorage = { getItem: () => 'on' };
globalThis.location = { search: '' };
const chain = new Proxy(function () {}, {
  get: (_, k) => (k === 'state' ? 'running' : k === 'currentTime' ? 0 : chain),
  set: () => true,
  apply: () => chain,
});
globalThis.AudioContext = function () {
  return chain;
};

const { registerKeys } = await import('../js/ui-keys.js');
const sfx = await import('../js/sfx.js');

const fire = (type, ev) => {
  const e = { type, key: '', repeat: false, target: new FakeEl('div'), defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...ev };
  for (const fn of [...(listeners[type] ?? [])]) fn(e);
  return e;
};
const key = (k, ev) => fire('keydown', { key: k, ...ev });
const rec = () => {
  const calls = [];
  return { calls, add: (d) => calls.push(['add', d]), run: () => calls.push(['run']), removeLast: () => calls.push(['removeLast']) };
};

test('ui-keys: 矢印4種→add、Enter→run、Backspace→removeLast。Space・数字・Escape は何もしない', () => {
  const r = rec();
  const off = registerKeys(r);
  for (const k of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Backspace', ' ', '1', 'Escape']) key(k);
  assert.deepEqual(r.calls, [['add', 'up'], ['add', 'down'], ['add', 'left'], ['add', 'right'], ['run'], ['removeLast']]);
  off();
});

test('ui-keys: 矢印の長押し(repeat)は連続追加、Enter・Backspace の repeat は無視', () => {
  const r = rec();
  const off = registerKeys(r);
  key('ArrowUp', { repeat: true });
  key('ArrowUp', { repeat: true });
  key('Enter', { repeat: true });
  const bs = key('Backspace', { repeat: true });
  assert.deepEqual(r.calls, [['add', 'up'], ['add', 'up']]);
  assert.equal(bs.defaultPrevented, true, '入力欄外の Backspace は repeat でも preventDefault');
  off();
});

test('ui-keys: 入力欄・isBlocked・disabled・修飾キー・変換中は呼ばない', () => {
  const r = rec();
  let blocked = false;
  const btns = { up: new FakeEl('button', { disabled: true }), run: new FakeEl('button', { disabled: true }), removeLast: new FakeEl('button', { disabled: true }) };
  const off = registerKeys({ ...r, isBlocked: () => blocked, getButtons: () => btns });
  for (const tag of ['input', 'textarea']) {
    for (const k of ['ArrowUp', 'Enter', 'Backspace']) {
      const e = key(k, { target: new FakeEl(tag) });
      assert.equal(e.defaultPrevented, false, `${tag}の${k}は入力欄に任せる`);
    }
  }
  key('ArrowUp');
  key('Enter');
  key('Backspace');
  assert.deepEqual(r.calls, [], 'disabled のボタンに対応するキーは呼ばない');
  btns.up.disabled = btns.run.disabled = btns.removeLast.disabled = false;
  key('ArrowDown', { ctrlKey: true });
  key('ArrowDown', { isComposing: true });
  assert.deepEqual(r.calls, []);
  blocked = true;
  key('ArrowUp');
  key('Enter');
  key('Backspace');
  assert.deepEqual(r.calls, [], 'isBlocked 中は全キー無視');
  blocked = false;
  key('ArrowUp');
  key('Enter');
  key('Backspace');
  assert.deepEqual(r.calls, [['add', 'up'], ['run'], ['removeLast']], '解除すれば戻る(バッファしない)');
  off();
});

test('ui-keys: 命令チップ(palette)にフォーカスがあるときの Enter は本来の click を止めて run', () => {
  const r = rec();
  const off = registerKeys(r);
  const chip = new FakeEl('button', { dataset: { command: 'up' } });
  const e = key('Enter', { target: chip });
  assert.deepEqual(r.calls, [['run']]);
  assert.equal(e.defaultPrevented, true);
  const other = new FakeEl('button', { dataset: { action: 'menu' } });
  const e2 = key('Enter', { target: other });
  assert.deepEqual(r.calls, [['run']], 'それ以外のボタン上の Enter は本来の動作に任せる');
  assert.equal(e2.defaultPrevented, false);
  const eText = key('Enter');
  assert.equal(eText.defaultPrevented, true, 'ボタン外の Enter は preventDefault して run');
  off();
});

test('ui-keys: 登録は1回性（二重登録しない・解除で完全に外れる）', () => {
  const a = rec();
  const b = rec();
  const offA = registerKeys(a);
  const offB = registerKeys(b);
  assert.equal(listeners.keydown.size, 1, '再登録しても keydown は1本');
  key('ArrowUp');
  assert.deepEqual([a.calls.length, b.calls.length], [0, 1], '新しい登録だけが効く');
  offA();
  assert.equal(listeners.keydown.size, 1, '古い解除関数は新しい登録を外さない');
  offB();
  assert.equal(listeners.keydown.size, 0);
  key('ArrowUp');
  assert.equal(b.calls.length, 1);
  const offC = registerKeys(a);
  offC();
  offC();
  assert.equal(listeners.keydown.size, 0, '解除の二重呼びも安全');
});

test('sfx: skipClickSfx の clickSkipped は次の click で戻り、続くキーの音を消さない', () => {
  document.addEventListener('keydown', () => {});
  sfx.initClickSfx();
  const btn = new FakeEl('button');
  const log = window.__sfxLog;
  log.length = 0;
  sfx.skipClickSfx();
  fire('click', { target: btn });
  assert.deepEqual(log, [], '拒否分岐の click は無音');
  fire('click', { target: btn });
  assert.deepEqual(log, ['tap'], '次のキー由来 click(Enter・Backspace)は tap 1回');
  sfx.skipClickSfx();
  sfx.play('tap');
  assert.deepEqual(log, ['tap', 'tap'], '矢印の直接 play は clickSkipped の影響を受けない');
  fire('click', { target: btn });
  fire('click', { target: btn });
  assert.deepEqual(log, ['tap', 'tap', 'tap'], 'skip は直後の click だけ消す');
});
