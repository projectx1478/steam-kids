// #401 段1: 生成 API（POST /api/generate）。決定性・入力検査（400）・0件・打ち切り（GEN_ABORTED）・タイムアウト。実行: npm run test:unit
// 入力は小さい盤（4〜5マス四方・count 2）に限る。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { startEditorServer, runGenerate, checkGenerateInput, checkGenerateBase } from '../tools/editor/serve.mjs';
import { generateBoard } from '../tools/gen/stage-gen.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HANG_WORKER = path.join(ROOT, 'test', 'fixtures', 'hang-worker.mjs');

const SG = {
  grid: { cols: { min: 4, max: 5 }, rows: { min: 4, max: 5 } },
  walls: { min: 1, max: 3 },
  gimmicks: { items: { min: 1, max: 2 }, ice: { min: 1, max: 1 } },
  teach: 'items',
  shortestPath: { min: 3, max: 8 },
};
// 作れない設定（3×3 で最短 16）。既定の上限では 400 回使い切って 0 件
const IMPOSSIBLE = { grid: { cols: { min: 3, max: 3 }, rows: { min: 3, max: 3 } }, shortestPath: { min: 16, max: 16 } };

function post(port, body, raw = false) {
  return new Promise((resolve, reject) => {
    const data = raw ? body : JSON.stringify(body);
    const req = http.request({ host: '127.0.0.1', port, path: '/api/generate', method: 'POST', headers: { 'Content-Type': 'application/json' } }, (res) => {
      let s = '';
      res.on('data', (c) => { s += c; });
      res.on('end', () => resolve({ status: res.statusCode, json: JSON.parse(s) }));
    });
    req.on('error', reject);
    req.end(data);
  });
}

async function withServer(opts, fn) {
  const server = await startEditorServer({ port: 0, ...opts });
  try { return await fn(server.address().port); } finally { server.close(); }
}

test('checkGenerateInput: 正しい入力は問題なし（省略可の項目を省いてよい）', () => {
  assert.deepEqual(checkGenerateInput({ stageGen: SG }), []);
  assert.deepEqual(checkGenerateInput({ stageGen: { ...SG, minTurns: 1, seedBase: 5, allowedCommands: ['up', 'right', 'down'] }, count: 6, seed: 0 }), []);
  assert.deepEqual(checkGenerateInput({ stageGen: { grid: SG.grid, shortestPath: SG.shortestPath } }), []);
});

test('checkGenerateInput: 範囲外・形の誤り・受け付けないキーは messages を返す', () => {
  const bad = (body) => assert.ok(checkGenerateInput(body).length > 0, JSON.stringify(body));
  bad(null);
  bad([]);
  bad({});
  bad({ stageGen: [] });
  bad({ stageGen: { ...SG, ver: 1 } });
  bad({ stageGen: { ...SG, stages: 4 } });
  bad({ stageGen: { ...SG, keepHandwritten: [] } });
  bad({ stageGen: { ...SG, keyMode: 'carry' } });
  bad({ stageGen: { ...SG, foo: 1 } });
  bad({ stageGen: { ...SG, gimmicks: { cushion: { min: 1, max: 1 } }, teach: 'cushion' } });
  bad({ stageGen: { ...SG, gimmicks: { switches: { min: 1, max: 1 }, keys: { min: 1, max: 1 } }, teach: 'switches' } }); // switches は #492 で受け付けるが keys とは併用不可
  assert.deepEqual(checkGenerateInput({ stageGen: { ...SG, gimmicks: { periodic: { min: 1, max: 2 } }, teach: 'periodic' } }), []);
  bad({ stageGen: { ...SG, gimmicks: { periodic: { min: 1, max: 3 } }, teach: 'periodic' } }); // 周期ドアは1〜2
  assert.deepEqual(checkGenerateInput({ stageGen: { ...SG, gimmicks: { periodic: { min: 1, max: 1 }, items: { min: 1, max: 1 } }, teach: 'periodic' } }), []); // items との併用は通る（#531）
  bad({ stageGen: { ...SG, gimmicks: { periodic: { min: 1, max: 1 }, water: { min: 2, max: 4 } }, teach: 'periodic' } }); // warps・periodic・water は1種まで
  assert.deepEqual(checkGenerateInput({ stageGen: { ...SG, gimmicks: { paint: { min: 4, max: 8 } }, teach: 'paint' } }), []);
  bad({ stageGen: { ...SG, gimmicks: { paint: { min: 3, max: 8 } }, teach: 'paint' } }); // 色ぬりは4〜8
  bad({ stageGen: { ...SG, gimmicks: { paint: { min: 4, max: 4 }, items: { min: 1, max: 1 } }, teach: 'paint' } }); // 単独（water とだけ併用可）
  assert.deepEqual(checkGenerateInput({ stageGen: { ...SG, gimmicks: { paint: { min: 4, max: 4 }, water: { min: 2, max: 4 } }, teach: 'paint' } }), []); // 混在（#531 段2）
  assert.deepEqual(checkGenerateInput({ stageGen: { ...SG, gimmicks: { water: { min: 2, max: 8 } }, teach: 'water' } }), []);
  bad({ stageGen: { ...SG, gimmicks: { water: { min: 1, max: 8 } }, teach: 'water' } }); // 水は2〜8
  assert.deepEqual(checkGenerateInput({ stageGen: { ...SG, gimmicks: { water: { min: 2, max: 4 }, items: { min: 1, max: 1 } }, teach: 'water' } }), []); // items との併用は通る（#531）
  bad({ stageGen: { ...SG, grid: { cols: { min: 2, max: 5 }, rows: SG.grid.rows } } });
  bad({ stageGen: { ...SG, grid: { cols: { min: 4, max: 21 }, rows: SG.grid.rows } } });
  bad({ stageGen: { ...SG, walls: { min: 0, max: 61 } } });
  bad({ stageGen: { ...SG, shortestPath: { min: 1, max: 8 } } });
  bad({ stageGen: { ...SG, shortestPath: { min: 2, max: 61 } } });
  bad({ stageGen: { ...SG, shortestPath: { min: 8, max: 3 } } });
  bad({ stageGen: { ...SG, minTurns: 9 } });
  bad({ stageGen: { ...SG, allowedCommands: [] } });
  bad({ stageGen: { ...SG, allowedCommands: ['up', 'jump'] } });
  bad({ stageGen: { ...SG, seedBase: -1 } });
  bad({ stageGen: SG, count: 0 });
  bad({ stageGen: SG, count: 7 });
  bad({ stageGen: SG, count: 1.5 });
  bad({ stageGen: SG, seed: -1 });
  bad({ stageGen: SG, seed: 'a' });
  bad({ stageGen: SG, extra: 1 });
});

test('POST /api/generate: 400 は { messages } で返す（壊れた JSON・不正入力）', async () => {
  await withServer({}, async (port) => {
    const r1 = await post(port, '{oops', true);
    assert.equal(r1.status, 400);
    assert.ok(Array.isArray(r1.json.messages) && r1.json.messages.length > 0);
    const r2 = await post(port, { stageGen: { ...SG, ver: 1 } });
    assert.equal(r2.status, 400);
    assert.ok(r2.json.messages.some((m) => m.includes('ver')));
  });
});

test('POST /api/generate: 候補は count 枚、seed+i で generateBoard と一致、同入力2回で同一', async () => {
  await withServer({}, async (port) => {
    const a = await post(port, { stageGen: SG, count: 2, seed: 7 });
    const b = await post(port, { stageGen: SG, count: 2, seed: 7 });
    assert.equal(a.status, 200);
    assert.equal(a.json.status, 'ok');
    assert.deepEqual(a.json, b.json);
    assert.deepEqual(a.json.candidates.map((c) => c.seed), [7, 8]);
    for (const c of a.json.candidates) {
      assert.deepEqual(c.board, JSON.parse(JSON.stringify(generateBoard(SG, c.seed))));
      assert.equal(c.shortestPath, c.board.solution.length);
      assert.ok(c.shortestPath >= 3 && c.shortestPath <= 8);
    }
  });
});

test('runGenerate: seed 省略は seedBase（無ければ 1）、count 省略は 4', async () => {
  const r = await runGenerate({ stageGen: { ...SG, seedBase: 3 } });
  assert.equal(r.status, 'ok');
  assert.deepEqual(r.candidates.map((c) => c.seed), [3, 4, 5, 6]);
  const r2 = await runGenerate({ stageGen: SG, count: 1 });
  assert.deepEqual(r2.candidates.map((c) => c.seed), [1]);
});

test('runGenerate: 作れない設定は status:empty（候補なし）', async () => {
  const r = await runGenerate({ stageGen: IMPOSSIBLE, count: 1 });
  assert.deepEqual(r, { status: 'empty', candidates: [] });
});

test('runGenerate: 探索量の上限（GEN_ABORTED）で status:aborted', async () => {
  const r = await runGenerate({ stageGen: IMPOSSIBLE, count: 2 }, { maxWork: 1 });
  assert.deepEqual(r, { status: 'aborted', candidates: [] });
});

test('runGenerate: 応答しない worker は安全弁のタイムアウトで status:aborted', async () => {
  const r = await runGenerate({ stageGen: SG, count: 1 }, { timeoutMs: 200, workerFile: HANG_WORKER });
  assert.deepEqual(r, { status: 'aborted', candidates: [] });
});

test('runGenerate: signal を abort すると安全弁を待たず status:aborted で返り、worker が止まる', async () => {
  const ac = new AbortController();
  const t0 = Date.now();
  const p = runGenerate({ stageGen: SG, count: 1 }, { timeoutMs: 60000, workerFile: HANG_WORKER, signal: ac.signal });
  setTimeout(() => ac.abort(), 100);
  const r = await p;
  assert.deepEqual(r, { status: 'aborted', candidates: [] });
  assert.ok(Date.now() - t0 < 5000, 'タイムアウト(60秒)を待たずに返る');
  // 事前に abort 済みの signal でも即座に aborted
  const pre = new AbortController();
  pre.abort();
  assert.deepEqual(await runGenerate({ stageGen: SG, count: 1 }, { timeoutMs: 60000, workerFile: HANG_WORKER, signal: pre.signal }), { status: 'aborted', candidates: [] });
  // 応答しない worker が残っていれば、このテストファイルのプロセスが終わらない（terminate されたことの間接確認）
});

// ---- #631 段1: stageGen.base（土台の盤）----
// base-strip（6×6、水7・橋1）の水・橋、base-ng-split（5×5、中央の縦一列が水で陸が2島・橋なし）は設計時の盤を写したもの
const BASE = {
  grid: { cols: 6, rows: 6 },
  water: [{ x: 3, y: 0 }, { x: 3, y: 1 }, { x: 3, y: 2 }, { x: 3, y: 3 }, { x: 3, y: 5 }, { x: 0, y: 5 }, { x: 5, y: 5 }],
  bridge: [{ x: 3, y: 4 }],
};
const NG_SPLIT = { grid: { cols: 5, rows: 5 }, water: [0, 1, 2, 3, 4].map((y) => ({ x: 2, y })), bridge: [] };
const BASE_SG = { base: BASE, shortestPath: { min: 8, max: 30 }, gimmicks: { items: { min: 1, max: 2 } }, teach: 'items' };
const NG_BODY = () => ({ stageGen: { base: NG_SPLIT, shortestPath: { min: 3, max: 8 } } });

test('checkGenerateInput: base-strip の水・橋を base にした要求は通る', () => {
  assert.deepEqual(checkGenerateInput({ stageGen: BASE_SG }), []);
  assert.deepEqual(checkGenerateBase(BASE, {}), []);
});

test('checkGenerateInput: base-ng-split（陸が2島・橋なし）は messages を返す', () => {
  const ms = checkGenerateInput(NG_BODY());
  assert.ok(ms.some((m) => m.includes('つながっていない')), ms.join('|'));
});

test('checkGenerateInput: base と grid／water／paint／warps／periodic の同時指定、不正な base は messages', () => {
  const bad = (stageGen, word) => {
    const ms = checkGenerateInput({ stageGen });
    assert.ok(ms.length > 0 && ms.join('|').includes(word), `${word}: ${ms.join('|')}`);
  };
  bad({ ...BASE_SG, grid: SG.grid }, 'grid');
  bad({ ...BASE_SG, gimmicks: { water: { min: 2, max: 3 } }, teach: 'water' }, 'water');
  bad({ ...BASE_SG, gimmicks: { paint: { min: 4, max: 5 } }, teach: 'paint' }, 'paint');
  bad({ ...BASE_SG, gimmicks: { warps: { min: 1, max: 1 } }, teach: 'warps' }, 'warps');
  bad({ ...BASE_SG, gimmicks: { periodic: { min: 1, max: 1 } }, teach: 'periodic' }, 'periodic');
  bad({ ...BASE_SG, base: { ...BASE, foo: 1 } }, 'foo');
  bad({ ...BASE_SG, base: { ...BASE, grid: { cols: 2, rows: 6 } } }, 'grid');
  bad({ ...BASE_SG, base: { ...BASE, water: [...BASE.water, { x: 9, y: 9 }] } }, '盤の外');
  bad({ ...BASE_SG, base: { ...BASE, water: [...BASE.water, BASE.water[0]] } }, '重複');
  bad({ ...BASE_SG, base: { ...BASE, walls: [BASE.water[0]] } }, '重な');
  bad({ ...BASE_SG, base: { ...BASE, bridge: [{ x: 1, y: 1 }] } }, '水がありません');
  const row = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 0, y: 2 }, { x: 1, y: 2 }];
  bad({ ...BASE_SG, base: { grid: { cols: 3, rows: 3 }, walls: row } }, '少ない');
  // 土台に水が無ければ warps は併用できる
  assert.deepEqual(checkGenerateInput({ stageGen: { base: { grid: { cols: 5, rows: 5 } }, shortestPath: { min: 3, max: 8 }, gimmicks: { warps: { min: 1, max: 1 } }, teach: 'warps' } }), []);
});

test('レッスン JSON の stageGen に base があれば validate NG（従来どおり）', async () => {
  const { checkStageGen } = await import('../tools/lib/validate/stagegen.mjs');
  const errs = [];
  checkStageGen({ stageGen: { ver: 1, stages: 2, grid: SG.grid, shortestPath: SG.shortestPath, base: BASE } }, [], (r, d) => errs.push(`${r}: ${d}`));
  assert.ok(errs.some((e) => e.includes('base')), errs.join('|'));
});

test('runGenerate: base-strip の水・橋を土台にすると候補が出て、水・橋は base と一致', async () => {
  const r = await runGenerate({ stageGen: BASE_SG, count: 2, seed: 1 });
  assert.equal(r.status, 'ok');
  for (const c of r.candidates) {
    assert.deepEqual(c.board.water, BASE.water);
    assert.deepEqual(c.board.bridge, BASE.bridge);
    assert.deepEqual(c.board.grid, BASE.grid);
  }
});

test('POST /api/generate: base-ng-split は 400', async () => {
  await withServer({}, async (port) => {
    const r = await post(port, NG_BODY());
    assert.equal(r.status, 400);
    assert.ok(r.json.messages.length > 0);
  });
});
