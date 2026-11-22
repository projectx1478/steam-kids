// #782（#720 段2）: 考えどころ API（POST /api/kangae）・worker・表示文言の一致。実行: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { startEditorServer, runKangae, KANGAE_TIMEOUT_MS } from '../tools/editor/serve.mjs';
import { kangaeOfSpec } from '../tools/editor/kangae-worker.mjs';
import { formatKangae } from '../tools/editor/editor-view.js';
import { formatKangaeLines } from '../tools/lib/board-metrics.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HANG_WORKER = path.join(ROOT, 'test', 'fixtures', 'hang-worker.mjs');
const playOf = (file, stepId) => JSON.parse(fs.readFileSync(path.join(ROOT, 'lessons', file), 'utf8')).steps.find((s) => s.kind === 'play' && s.stepId === stepId);
const LINE = { grid: { cols: 3, rows: 1 }, start: { x: 0, y: 0 }, goal: { x: 2, y: 0 } };

test('KANGAE_TIMEOUT_MS は16秒（kangaedokoro の15秒より長い）', () => {
  assert.equal(KANGAE_TIMEOUT_MS, 16_000);
});

test('kangaeOfSpec: allowedCommands が無い盤は4方向で判定する（ice-01 p1 は K1＝はい）', () => {
  const play = playOf('ice-01-suberu.json', 'p1');
  const { allowedCommands, ...rest } = play;
  const r = kangaeOfSpec(rest);
  assert.equal(r.k1.value, true);
});

test('runKangae: ok で k1〜k3 を返す', async () => {
  const r = await runKangae(LINE);
  assert.equal(r.status, 'ok');
  for (const k of ['k1', 'k2', 'k3']) assert.ok(k in r);
});

test('runKangae: 打ち切りは status:timeout', async () => {
  const r = await runKangae(LINE, { kangaeTimeoutMs: 50, kangaeWorkerFile: HANG_WORKER });
  assert.deepEqual(r, { status: 'timeout' });
});

test('formatKangae: 判定中・時間切れ', () => {
  assert.deepEqual(formatKangae(null), ['考えどころ: 判定中…']);
  assert.deepEqual(formatKangae({ status: 'timeout' }), ['考えどころ: 不明（時間切れ）']);
});

test('formatKangae は formatKangaeLines と同じ3行（実面の4つ＋不明）', () => {
  const faces = [['cmd-01-susumu.json', 'p1'], ['ice-01-suberu.json', 'p1'], ['donguri-01-hirou.json', 'p4'], ['donguri-01-hirou.json', 'p3']];
  for (const [f, id] of faces) {
    const r = kangaeOfSpec(playOf(f, id));
    assert.deepEqual(formatKangae({ status: 'ok', ...r }), formatKangaeLines(r), `${f} ${id}`);
  }
  const unk = { value: null, reason: '15秒で打ち切り' };
  const r = { k1: unk, k2: { ...unk, goodOrders: 0, totalOrders: null }, k3: unk };
  assert.deepEqual(formatKangae({ status: 'ok', ...r }), formatKangaeLines(r));
});

function post(port, body) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: '/api/kangae', method: 'POST', headers: { 'Content-Type': 'application/json' } }, (res) => {
      let s = '';
      res.on('data', (c) => { s += c; });
      res.on('end', () => resolve({ status: res.statusCode, json: JSON.parse(s) }));
    });
    req.on('error', reject);
    req.end(typeof body === 'string' ? body : JSON.stringify(body));
  });
}

test('POST /api/kangae: 200／不正な入力は400', async () => {
  const srv = await startEditorServer({ port: 0 });
  const { port } = srv.address();
  try {
    const ok = await post(port, { spec: LINE });
    assert.equal(ok.status, 200);
    assert.equal(ok.json.status, 'ok');
    assert.equal((await post(port, { spec: {} })).status, 400);
    assert.equal((await post(port, 'not json')).status, 400);
  } finally {
    await new Promise((res) => srv.close(res));
  }
});
