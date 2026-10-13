// #400 段2: 勾配の警告（最短手数の非減少）。実行: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { startEditorServer, computeGradient } from '../tools/editor/serve.mjs';
import { formatMetrics } from '../tools/editor/editor-view.js';

// 横一列の盤。最短手数＝cols-1
const line = (cols, extra = {}) => ({ kind: 'play', stepId: `L${cols}`, grid: { cols, rows: 1 }, start: { x: 0, y: 0 }, goal: { x: cols - 1, y: 0 }, maxCommands: cols - 1, ...extra });
const intro = { kind: 'intro', stepId: 'i' };

function run(steps, index, specCols, specExtra = {}) {
  const spec = line(specCols, specExtra);
  return computeGradient({ lessonId: 'demo-01', index, steps, spec, shortest: specCols - 1 });
}

test('勾配: 最短手数が非減少なら警告なし（前・編集中・後が並ぶ）', () => {
  const r = run([line(3), line(4), line(6)], 1, 4);
  assert.deepEqual(r.gradient.map((g) => [g.index, g.shortest, g.ok]), [[0, 2, true], [1, 3, true], [2, 5, true]]);
  assert.deepEqual(r.messages, []);
});

test('勾配: 同じ最短は許す', () => {
  const r = run([line(4), line(4), line(4)], 1, 4);
  assert.ok(r.gradient.every((g) => g.ok));
  assert.deepEqual(r.messages, []);
});

test('勾配: 前の面より短いと警告（validate と同じ文言）。後の面より長いとその次が警告', () => {
  const r = run([line(5), line(5), line(5)], 1, 3);
  assert.deepEqual(r.gradient.map((g) => g.ok), [true, false, true]);
  assert.equal(r.messages.length, 1);
  assert.equal(r.messages[0], '難易度の順序: stepId="L3" の最短(2)がstepId="L5"の最短(4)より短い（ステージが進むほど難易度は非減少である必要がある）');
  const after = run([line(3), line(3), line(3)], 1, 6);
  assert.deepEqual(after.gradient.map((g) => g.ok), [true, true, false]);
  assert.equal(after.messages.length, 1);
});

test('勾配: 前後の play は intro などを飛ばして探す。先頭・末尾は片側だけ', () => {
  const r = run([intro, line(3), intro, line(4), line(5)], 3, 4);
  assert.deepEqual(r.gradient.map((g) => g.index), [1, 3, 4]);
  assert.deepEqual(run([line(3), line(4)], 0, 3).gradient.map((g) => g.index), [0, 1]);
});

test('勾配: repeatBox の面は箱なしの最短で比べる', () => {
  const box = line(7, { repeatBox: true, maxCommands: 3 });
  const r = computeGradient({ lessonId: 'demo-01', index: 1, steps: [line(3), box, line(5)], spec: box, shortest: 6 });
  assert.deepEqual(r.gradient.map((g) => g.shortest), [2, 6, 4]);
  assert.deepEqual(r.gradient.map((g) => g.ok), [true, true, false]);
});

test('勾配: groupRepeats の面と通常の面は混ぜない', () => {
  const g = line(6, { groupRepeats: true });
  const r = computeGradient({ lessonId: 'demo-01', index: 1, steps: [line(8), g, line(9)], spec: g, shortest: 1 });
  assert.deepEqual(r.gradient.map((e) => e.index), [1]);
  assert.deepEqual(r.messages, []);
  const ell = { kind: 'play', stepId: 'E', grid: { cols: 3, rows: 3 }, start: { x: 0, y: 0 }, goal: { x: 2, y: 2 }, maxCommands: 2, groupRepeats: true };
  const both = computeGradient({ lessonId: 'demo-01', index: 1, steps: [ell, g, line(9)], spec: g, shortest: 1 });
  assert.deepEqual(both.gradient.map((e) => e.index), [0, 1]);
  assert.equal(both.gradient[1].ok, false);
});

test('勾配: 範囲外の index・最短不明なら空', () => {
  assert.deepEqual(computeGradient({ lessonId: 'x', index: 5, steps: [line(3)], spec: line(3), shortest: 2 }), { gradient: [], messages: [] });
  assert.deepEqual(computeGradient({ lessonId: 'x', index: 0, steps: [line(3)], spec: line(3), shortest: null }), { gradient: [], messages: [] });
});

test('formatMetrics: 勾配の警告は保存を止めない旨を添える', () => {
  const base = { status: 'ok', clearable: true, shortest: 2, matters: {}, turns: 0, messages: [] };
  const warn = formatMetrics({ ...base, gradient: [{ lessonId: 'a', index: 0, shortest: 4, ok: true }, { lessonId: 'a', index: 1, shortest: 2, ok: false }] });
  assert.ok(warn.includes('勾配（最短手数）: 1面目=4 → 2面目=2（警告） ※保存はできます'));
  assert.ok(!formatMetrics({ ...base, gradient: [] }).some((l) => l.startsWith('勾配')));
});

function post(port, body) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: '/api/analyze', method: 'POST', headers: { 'Content-Type': 'application/json' } }, (res) => {
      let s = '';
      res.on('data', (c) => { s += c; });
      res.on('end', () => resolve({ status: res.statusCode, json: JSON.parse(s) }));
    });
    req.on('error', reject);
    req.end(JSON.stringify(body));
  });
}

test('POST /api/analyze: レッスンID＋位置で勾配を返す。不正は 400/404', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'editor-gradient-'));
  const prev = process.env.LESSONS_DIR;
  process.env.LESSONS_DIR = dir;
  fs.writeFileSync(path.join(dir, 'demo-01.json'), JSON.stringify({ steps: [line(5), line(5), line(6)] }));
  const server = await startEditorServer({ port: 0 });
  const { port } = server.address();
  try {
    const spec = line(3);
    const r = await post(port, { spec, lessonId: 'demo-01', index: 1 });
    assert.equal(r.status, 200);
    assert.deepEqual(r.json.gradient.map((g) => [g.index, g.shortest, g.ok]), [[0, 4, true], [1, 2, false], [2, 5, true]]);
    assert.ok(r.json.messages.some((m) => m.startsWith('難易度の順序')));
    assert.deepEqual((await post(port, { spec, lessonId: 'demo-01' })).json.gradient, []);
    assert.deepEqual((await post(port, { spec })).json.gradient, []);
    assert.equal((await post(port, { spec, lessonId: 'nothing-here', index: 0 })).status, 404);
    assert.equal((await post(port, { spec, lessonId: 'demo-01', index: 3 })).status, 400);
    assert.equal((await post(port, { spec, lessonId: 'demo-01', index: -1 })).status, 400);
    assert.equal((await post(port, { spec, lessonId: 'demo-01', index: 1.5 })).status, 400);
    assert.equal((await post(port, { spec, lessonId: '../x', index: 0 })).status, 400);
  } finally {
    await new Promise((res) => server.close(res));
    if (prev === undefined) delete process.env.LESSONS_DIR; else process.env.LESSONS_DIR = prev;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
