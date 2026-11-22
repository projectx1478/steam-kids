// 色の点検ツール（Issue #383 段1）：純粋関数と CLI の受け入れ条件。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  parseColor, contrastRatio, isLargeText, threshold, simulateCvd, deltaE,
} from '../tools/color-audit.mjs';

const TOOL = fileURLToPath(new URL('../tools/color-audit.mjs', import.meta.url));

test('parseColor：各形式と不正値', () => {
  assert.deepEqual(parseColor('rgb(16 185 129/var(--tw-bg-opacity,1))'), { r: 16, g: 185, b: 129, a: 1 });
  assert.deepEqual(parseColor('#fff'), { r: 255, g: 255, b: 255, a: 1 });
  assert.deepEqual(parseColor('#10b981'), { r: 16, g: 185, b: 129, a: 1 });
  assert.deepEqual(parseColor('rgb(1, 2, 3)'), { r: 1, g: 2, b: 3, a: 1 });
  assert.deepEqual(parseColor('rgb(1 2 3 / 0.5)'), { r: 1, g: 2, b: 3, a: 0.5 });
  assert.deepEqual(parseColor('white'), { r: 255, g: 255, b: 255, a: 1 });
  assert.deepEqual(parseColor('black'), { r: 0, g: 0, b: 0, a: 1 });
  assert.equal(parseColor('red'), null);
  assert.equal(parseColor('#ggg'), null);
});

test('contrastRatio：WCAG 2.1 の値と対称性', () => {
  assert.equal(contrastRatio('#ffffff', '#000000'), 21);
  assert.equal(contrastRatio('#ffffff', '#10b981').toFixed(2), '2.54');
  assert.equal(contrastRatio('#ffffff', '#f59e0b').toFixed(2), '2.15');
  assert.equal(contrastRatio('#ffffff', '#0ea5e9').toFixed(2), '2.77');
  assert.equal(contrastRatio('#0f172a', '#fbbf24').toFixed(2), '10.69');
  assert.equal(contrastRatio('#0ea5e9', '#ffffff'), contrastRatio('#ffffff', '#0ea5e9'));
});

test('isLargeText / threshold', () => {
  assert.equal(isLargeText(18, true), false);
  assert.equal(isLargeText(20, true), true);
  assert.equal(isLargeText(20, false), false);
  assert.equal(isLargeText(24, false), true);
  assert.equal(threshold(14, true), 4.5);
  assert.equal(threshold(20, true), 3);
});

test('simulateCvd：白は白のまま、黒は黒のまま', () => {
  for (const type of ['protan', 'deutan']) {
    const c = simulateCvd('#ffffff', type);
    for (const k of ['r', 'g', 'b']) assert.ok(Math.abs(c[k] - 255) <= 1, `${type}.${k}=${c[k]}`);
  }
  assert.deepEqual(simulateCvd('#000000', 'deutan'), { r: 0, g: 0, b: 0 });
});

test('deltaE', () => {
  assert.equal(deltaE('#ffffff', '#ffffff'), 0);
  assert.ok(deltaE('#ffffff', '#000000') > 90);
});

test('CLI --json：3表の件数と代表行', () => {
  const r = spawnSync(process.execPath, [TOOL, '--json'], { encoding: 'utf-8', maxBuffer: 32 * 1024 * 1024 });
  assert.equal(r.status, 0, r.stderr);
  const { textPairs, cssPairs, meaningPairs } = JSON.parse(r.stdout);
  assert.ok(textPairs.length >= 30, `textPairs=${textPairs.length}`);
  assert.ok(Array.isArray(cssPairs));
  assert.equal(meaningPairs.length, 13);
  const dot = textPairs.find((p) => p.file === 'js/ui-step.js' && p.bg === '#0ea5e9' && p.fg === '#ffffff');
  assert.ok(dot, 'ui-step の bg-sky-500 text-white');
  assert.equal(dot.ratio, 2.77);
  assert.equal(dot.pass, false);
  assert.equal(dot.scope, '子ども');
  const picker = textPairs.find((p) => p.file === 'js/ui-picker.js' && p.bg === '#cbd5e1' && p.fg === '#475569');
  assert.ok(picker, 'ui-picker の bg-slate-300 text-slate-600');
  assert.equal(picker.ratio, 5.1);
  assert.equal(picker.pass, true);
  for (const m of meaningPairs) {
    for (const k of ['normal', 'protan', 'deutan']) assert.equal(typeof m[k], 'number', `${m.id}.${k}`);
    assert.equal(typeof m.cue, 'string');
  }
});

test('CLI 既定：Markdown を出して終了コード0', () => {
  const r = spawnSync(process.execPath, [TOOL], { encoding: 'utf-8', maxBuffer: 32 * 1024 * 1024 });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /textPairs/);
  assert.match(r.stdout, /meaningPairs/);
});
