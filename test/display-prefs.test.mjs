// 表示設定（もじを おおきく／うごきを へらす。Issue #379）の純関数テスト。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { displayAttrs, applyDisplayPrefs, prefersReducedMotion } from '../js/display-prefs.js';

function withGlobals(vals, fn) {
  const saved = {};
  for (const k of Object.keys(vals)) {
    saved[k] = Object.getOwnPropertyDescriptor(globalThis, k);
    if (vals[k] === undefined) delete globalThis[k];
    else Object.defineProperty(globalThis, k, { value: vals[k], configurable: true, writable: true });
  }
  try { return fn(); } finally {
    for (const k of Object.keys(vals)) {
      if (saved[k]) Object.defineProperty(globalThis, k, saved[k]);
      else delete globalThis[k];
    }
  }
}

test('displayAttrs: 既定・不正値は null', () => {
  assert.deepEqual(displayAttrs(null), { text: null, motion: null });
  assert.deepEqual(displayAttrs(undefined), { text: null, motion: null });
  assert.deepEqual(displayAttrs({ largeText: 'yes' }), { text: null, motion: null });
});

test('displayAttrs: largeText / reduceMotion', () => {
  assert.deepEqual(displayAttrs({ largeText: true }), { text: 'large', motion: null });
  assert.deepEqual(displayAttrs({ reduceMotion: true, largeText: false }), { text: null, motion: 'reduce' });
});

test('applyDisplayPrefs: dataset へ反映し、無ければ消す', () => {
  const root = { dataset: {} };
  applyDisplayPrefs({ largeText: true, reduceMotion: true }, root);
  assert.deepEqual(root.dataset, { skText: 'large', skMotion: 'reduce' });
  applyDisplayPrefs({}, root);
  assert.deepEqual(root.dataset, {});
});

test('applyDisplayPrefs: root 省略かつ document 無しで例外を出さない', () => {
  withGlobals({ document: undefined }, () => {
    assert.doesNotThrow(() => applyDisplayPrefs({ largeText: true }));
  });
});

test('prefersReducedMotion: document・matchMedia 無しで false', () => {
  withGlobals({ document: undefined, matchMedia: undefined }, () => {
    assert.equal(prefersReducedMotion(), false);
  });
});

test('prefersReducedMotion: アプリ設定が reduce なら true', () => {
  withGlobals({
    document: { documentElement: { dataset: { skMotion: 'reduce' } } },
    matchMedia: () => ({ matches: false }),
  }, () => {
    assert.equal(prefersReducedMotion(), true);
  });
});

test('prefersReducedMotion: 端末の設定が reduce なら true', () => {
  withGlobals({
    document: { documentElement: { dataset: {} } },
    matchMedia: () => ({ matches: true }),
  }, () => {
    assert.equal(prefersReducedMotion(), true);
  });
});
