// #400 段1: 判定 API（POST /api/analyze）・検査の抽出・世代番号・打ち切り。実行: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { startEditorServer, runAnalyze, checkAnalyzeInput } from '../tools/editor/serve.mjs';
import { analyzeSpec, switchesMustMatter } from '../tools/editor/validate-worker.mjs';
import { periodicMustMatter, paintMustMatter, itemsMustMatter, iceMustMatter } from '../tools/lib/must-matter.mjs';
import { itemsMustMatter as itemsFromStageGen } from '../tools/gen/stage-gen.mjs';
import { createState, nextGeneration, shouldApplyResult } from '../tools/editor/editor-state.js';
import { formatMetrics, ANALYZE_DEBOUNCE_MS } from '../tools/editor/editor-view.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HANG_WORKER = path.join(ROOT, 'test', 'fixtures', 'hang-worker.mjs');

const LINE = { grid: { cols: 3, rows: 1 }, start: { x: 0, y: 0 }, goal: { x: 2, y: 0 } };
const playOf = (lessonFile) => JSON.parse(fs.readFileSync(path.join(ROOT, 'lessons', lessonFile), 'utf8')).steps.find((s) => s.kind === 'play');

function post(port, body, raw = false) {
  return new Promise((resolve, reject) => {
    const data = raw ? body : JSON.stringify(body);
    const req = http.request({ host: '127.0.0.1', port, path: '/api/analyze', method: 'POST', headers: { 'Content-Type': 'application/json' } }, (res) => {
      let s = '';
      res.on('data', (c) => { s += c; });
      res.on('end', () => resolve({ status: res.statusCode, json: JSON.parse(s) }));
    });
    req.on('error', reject);
    req.end(data);
  });
}

test('must-matter: stage-gen の再 export は同じ関数', () => {
  assert.equal(itemsFromStageGen, itemsMustMatter);
});

test('must-matter: 周期ドア・paint は対象外なら matters:true / dist:null', () => {
  assert.deepEqual(periodicMustMatter({ ...LINE, maxCommands: 2 }, 2), { matters: true, dist: null });
  assert.deepEqual(periodicMustMatter({ ...LINE, periodic: [{ x: 1, y: 0, period: 2 }] }, null), { matters: true, dist: null });
  assert.deepEqual(paintMustMatter({ ...LINE }, 2), { matters: true, dist: null });
  assert.deepEqual(iceMustMatter({ ...LINE }), { matters: true, dist: null });
});

test('analyzeSpec: 実レッスンの盤（こおり・かぎ・paint）で必須を判定する', () => {
  const ice = analyzeSpec(playOf('ice-01-suberu.json'));
  assert.equal(ice.clearable, true);
  assert.equal(typeof ice.matters.ice, 'boolean');
  const paint = analyzeSpec(playOf('paint-01-nuru.json'));
  assert.equal(typeof paint.matters.paint, 'boolean');
  const key = analyzeSpec(playOf('key-01-kagi.json'));
  assert.equal(typeof key.matters.keys, 'boolean');
  for (const r of [ice, paint, key]) {
    assert.equal(typeof r.shortest, 'number');
    assert.equal(typeof r.turns, 'number');
  }
});

test('analyzeSpec: 実レッスンの合格盤は messages 無し（validate と同じ向き）', () => {
  for (const f of ['ice-01-suberu.json', 'paint-01-nuru.json', 'key-01-kagi.json', 'switch-01-suicchi.json']) {
    const r = analyzeSpec(playOf(f));
    assert.deepEqual(r.messages, [], f);
  }
});

test('analyzeSpec: スイッチ盤は switches の必須を判定する／無い盤は null', () => {
  const sw = analyzeSpec(playOf('switch-01-suicchi.json'));
  assert.equal(typeof sw.matters.switches, 'boolean');
  assert.equal(analyzeSpec(LINE).matters.switches, null);
  assert.deepEqual(switchesMustMatter({ ...LINE }, 2), { matters: null, messages: [] });
});

test('analyzeSpec: maxCommands が無ければ最短手数を使う。曲がる回数は一例', () => {
  const r = analyzeSpec({ grid: { cols: 3, rows: 2 }, start: { x: 0, y: 0 }, goal: { x: 2, y: 1 } });
  assert.equal(r.clearable, true);
  assert.equal(r.shortest, 3);
  assert.equal(typeof r.turns, 'number');
});

test('analyzeSpec: 成り立たない盤は clearable:false + messages', () => {
  const r = analyzeSpec({ ...LINE, walls: [{ x: 1, y: 0 }] });
  assert.equal(r.clearable, false);
  assert.equal(r.shortest, null);
  assert.ok(r.messages.length > 0);
  const tight = analyzeSpec({ ...LINE, maxCommands: 1 });
  assert.equal(tight.clearable, false);
  assert.equal(tight.shortest, 2);
});

test('checkAnalyzeInput: 必須キー・範囲・id・index の検査', () => {
  assert.deepEqual(checkAnalyzeInput({ spec: LINE }), []);
  assert.ok(checkAnalyzeInput(null).length > 0);
  assert.ok(checkAnalyzeInput({}).length > 0);
  assert.ok(checkAnalyzeInput({ spec: { grid: LINE.grid, start: LINE.start } }).length > 0);
  assert.ok(checkAnalyzeInput({ spec: { ...LINE, grid: { cols: 21, rows: 1 } } }).length > 0);
  assert.deepEqual(checkAnalyzeInput({ spec: { ...LINE, grid: { cols: 20, rows: 20 } } }), []);
  assert.ok(checkAnalyzeInput({ spec: LINE, lessonId: '../x' }).length > 0);
  for (const index of [-1, 1.5, '1']) assert.ok(checkAnalyzeInput({ spec: LINE, index }).length > 0, String(index));
});

test('POST /api/analyze: 200 / 400 / 404、実レッスンは読むだけ', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'editor-analyze-'));
  const prev = process.env.LESSONS_DIR;
  process.env.LESSONS_DIR = dir;
  fs.writeFileSync(path.join(dir, 'demo-01.json'), JSON.stringify({ steps: [{ kind: 'play' }, { kind: 'play' }] }));
  const server = await startEditorServer({ port: 0 });
  const { port } = server.address();
  try {
    const ok = await post(port, { spec: LINE });
    assert.equal(ok.status, 200);
    assert.equal(ok.json.status, 'ok');
    assert.equal(ok.json.clearable, true);
    assert.equal(ok.json.shortest, 2);
    assert.deepEqual(ok.json.gradient, []);
    assert.equal((await post(port, { spec: LINE, lessonId: 'demo-01', index: 1 })).status, 200);
    const unsolvable = await post(port, { spec: { ...LINE, walls: [{ x: 1, y: 0 }] } });
    assert.equal(unsolvable.status, 200);
    assert.equal(unsolvable.json.clearable, false);
    assert.equal((await post(port, '{oops', true)).status, 400);
    assert.equal((await post(port, '', true)).status, 400);
    assert.equal((await post(port, { spec: { ...LINE, grid: { cols: 21, rows: 1 } } })).status, 400);
    assert.equal((await post(port, { spec: { grid: LINE.grid } })).status, 400);
    assert.equal((await post(port, { spec: LINE, lessonId: 'nothing-here' })).status, 404);
    assert.equal((await post(port, { spec: LINE, lessonId: '../x' })).status, 400);
    assert.equal((await post(port, { spec: LINE, lessonId: 'demo-01', index: 2 })).status, 400);
    assert.equal((await post(port, { spec: LINE, lessonId: 'demo-01', index: -1 })).status, 400);
  } finally {
    await new Promise((r) => server.close(r));
    if (prev === undefined) delete process.env.LESSONS_DIR; else process.env.LESSONS_DIR = prev;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('runAnalyze: 打ち切りは status:timeout で他の値は null', async () => {
  const r = await runAnalyze(LINE, { timeoutMs: 200, workerFile: HANG_WORKER });
  assert.equal(r.status, 'timeout');
  assert.equal(r.clearable, null);
  assert.equal(r.shortest, null);
  assert.equal(r.matters, null);
  assert.equal(r.turns, null);
});

test('POST /api/analyze: 打ち切りは 200 + status:timeout', async () => {
  const server = await startEditorServer({ port: 0, timeoutMs: 200, workerFile: HANG_WORKER });
  try {
    const r = await post(server.address().port, { spec: LINE });
    assert.equal(r.status, 200);
    assert.equal(r.json.status, 'timeout');
    assert.equal(r.json.shortest, null);
  } finally {
    await new Promise((res) => server.close(res));
  }
});

test('世代番号: 後から送った判定があれば古い結果は捨てる', () => {
  const state = createState(LINE);
  const g1 = nextGeneration(state);
  const g2 = nextGeneration(state);
  assert.ok(g2 > g1);
  assert.equal(shouldApplyResult(state, g1), false);
  assert.equal(shouldApplyResult(state, g2), true);
});

test('formatMetrics: 打ち切りは「未判定」でOKに見せない。曲がる回数に「一例」', () => {
  assert.deepEqual(formatMetrics({ status: 'timeout', clearable: null }), ['未判定（時間切れ）']);
  assert.deepEqual(formatMetrics(null), ['判定中…']);
  const lines = formatMetrics({ status: 'ok', clearable: true, shortest: 5, matters: { ice: true, keys: null, paint: false }, turns: 2, messages: ['x'] });
  assert.ok(lines.includes('クリア: できる'));
  assert.ok(lines.includes('最短手数: 5'));
  assert.ok(lines.includes('こおりの必須: 必須'));
  assert.ok(lines.includes('ぬりの必須: 飾り（NG）'));
  assert.ok(!lines.some((l) => l.startsWith('かぎ')));
  assert.ok(lines.includes('曲がる回数（一例）: 2'));
  assert.ok(lines.includes('! x'));
});

test('デバウンスは約300ms／エディタは localStorage を使わない', () => {
  assert.equal(ANALYZE_DEBOUNCE_MS, 300);
  for (const f of ['editor.js', 'editor-view.js', 'editor-state.js', 'serve.mjs', 'validate-worker.mjs']) {
    assert.equal(/localStorage/.test(fs.readFileSync(path.join(ROOT, 'tools', 'editor', f), 'utf8')), false, f);
  }
});
