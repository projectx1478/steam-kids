// 命令パレットの⚙（せってい）と「とめる」の回数統合（#467 段B）。ブラウザ不要の最小DOM代用で確かめる。実行: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';

// --- 最小のDOM代用（renderCommandPalette・setPauseLeft が触る範囲）
const camel = (k) => k.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
class FakeEl {
  constructor(tag) {
    this.tagName = tag;
    this.children = [];
    this.dataset = {};
    this.attrs = {};
    this.listeners = {};
    this.className = '';
    this._html = '';
    this._text = '';
  }
  set innerHTML(v) { this._html = v; if (v === '') this.children = []; }
  get innerHTML() { return this._html; }
  set textContent(v) { this._text = String(v); }
  get textContent() { return this._text; }
  appendChild(c) { this.children.push(c); return c; }
  append(...cs) { cs.forEach((c) => this.children.push(c)); }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return this.attrs[k] ?? null; }
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
  removeEventListener() {}
  // [data-x] と [data-x="v"] だけ対応
  matches(sel) {
    const m = sel.match(/^\[data-([a-z-]+)(?:="([^"]*)")?\]$/);
    if (!m) return false;
    const v = this.dataset[camel(m[1])];
    return v !== undefined && (m[2] === undefined || v === m[2]);
  }
  querySelector(sel) {
    for (const c of this.children) {
      if (c.matches(sel)) return c;
      const r = c.querySelector(sel);
      if (r) return r;
    }
    return null;
  }
}
globalThis.document = { createElement: (t) => new FakeEl(t) };
globalThis.window = globalThis;

const { renderCommandPalette, setPauseLeft } = await import('../js/ui-commands.js');

const tagOf = (el) => el.dataset.command ?? el.dataset.action ?? (el.dataset.blank ? `blank-${el.dataset.blank}` : '?');
const noop = () => {};

test('onMenu あり: ⚙ が data-action=menu で入り、click で自身を渡して onMenu を呼ぶ', () => {
  const c = new FakeEl('div');
  let got = null;
  renderCommandPalette(c, { onAdd: noop, onMenu: (b) => { got = b; } });
  const menu = c.querySelector('[data-action="menu"]');
  assert.ok(menu);
  assert.equal(menu.tagName, 'button');
  assert.equal(menu.getAttribute('aria-label'), 'せってい');
  assert.ok(menu.innerHTML.includes('せってい'));
  menu.listeners.click[0]();
  assert.equal(got, menu);
});

test('onMenu なし: ⚙ は出ない', () => {
  const c = new FakeEl('div');
  renderCommandPalette(c, { onAdd: noop });
  assert.equal(c.querySelector('[data-action="menu"]'), null);
});

test('maxPauses=0: DOM順は up 先頭、左上は空きマス（left のみ）、⚙ が最後', () => {
  const c = new FakeEl('div');
  renderCommandPalette(c, { onAdd: noop, onMenu: noop });
  const order = c.children.map(tagOf);
  assert.equal(order[0], 'up');
  assert.deepEqual(order.slice(0, 4).sort(), ['down', 'left', 'right', 'up']);
  assert.ok(order.includes('blank-left'));
  assert.ok(!order.includes('blank-right'));
  assert.equal(order.at(-1), 'menu');
  assert.equal(c.querySelector('[data-action="pause"]'), null);
});

test('maxPauses>0: 「とめる」に回数を統合し、空きマスは出ない', () => {
  const c = new FakeEl('div');
  renderCommandPalette(c, { onAdd: noop, onMenu: noop, maxPauses: 2 });
  const pause = c.querySelector('[data-action="pause"]');
  assert.ok(pause);
  assert.equal(pause.dataset.pauseCount, '2');
  assert.equal(pause.dataset.pauseLeft, '2');
  assert.equal(pause.getAttribute('aria-label'), 'とめる のこり 2かい');
  assert.equal(pause.querySelector('[data-pause-left-badge]').textContent, '2');
  assert.equal(c.children.map(tagOf).filter((t) => t.startsWith('blank')).length, 0);
  assert.equal(c.children.map(tagOf).at(-1), 'menu');
});

test('setPauseLeft: ボタン内のバッジ・data-pause-left・aria-label を更新する', () => {
  const c = new FakeEl('div');
  renderCommandPalette(c, { onAdd: noop, onMenu: noop, maxPauses: 2 });
  setPauseLeft(c, 1);
  const pause = c.querySelector('[data-action="pause"]');
  assert.equal(pause.dataset.pauseLeft, '1');
  assert.equal(pause.querySelector('[data-pause-left-badge]').textContent, '1');
  assert.equal(pause.getAttribute('aria-label'), 'とめる のこり 1かい');
});

test('setPauseLeft: maxPauses=0 では何もしない', () => {
  const c = new FakeEl('div');
  renderCommandPalette(c, { onAdd: noop, onMenu: noop });
  assert.doesNotThrow(() => setPauseLeft(c, 0));
});
