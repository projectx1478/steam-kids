// tools/lib/board-metrics.mjs（Issue #720）：K1〜K3・候補数・表示文言・analyze-board の一覧と1面出力。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { loadPlay } from '../tools/analyze-board.mjs';
import { checkK1, checkK2, checkK3, kangaedokoro, candidateCount, formatKangaeLines } from '../tools/lib/board-metrics.mjs';

test('K1〜K3：設計の試作の値', () => {
  const rows = [
    ['cmd-01-susumu', 'p1', false, false, false, 0, null],
    ['ice-01-suberu', 'p1', true, false, false, 0, null],
    ['donguri-01-hirou', 'p4', true, true, true, 1, 2],
    ['donguri-01-hirou', 'p3', true, false, false, 4, 6],
    ['key-02-iro', 'p1', true, false, true, 0, null],
    ['key-02-iro', 'p2', false, false, false, 0, null],
    ['switch-02-futatsu', 'p2', true, false, false, 0, null],
  ];
  for (const [l, s, k1, k2, k3, good, total] of rows) {
    const play = loadPlay(l, s);
    assert.equal(checkK1(play).value, k1, `${l} ${s} K1`);
    const r2 = checkK2(play);
    assert.equal(r2.value, k2, `${l} ${s} K2`);
    assert.equal(r2.goodOrders, good, `${l} ${s} goodOrders`);
    assert.equal(r2.totalOrders, total, `${l} ${s} totalOrders`);
    assert.equal(checkK3(play).value, k3, `${l} ${s} K3`);
  }
  assert.equal(checkK2(loadPlay('cmd-01-susumu', 'p1')).reason, 'どんぐり2個未満');
});

const BIG = {
  stepId: 'x', kind: 'play', grid: { cols: 20, rows: 20 }, walls: [], start: { x: 0, y: 19 }, goal: { x: 19, y: 0 },
  items: [{ x: 5, y: 5 }, { x: 15, y: 15 }, { x: 10, y: 2 }], ice: [{ x: 3, y: 3 }, { x: 4, y: 3 }], maxCommands: 60,
};

test('20×20 の盤は15秒以内に3値とも出る・打ち切りは null', () => {
  const t = Date.now();
  const r = kangaedokoro(BIG);
  assert.ok(Date.now() - t < 15_000);
  assert.deepEqual([r.k1.value, r.k2.value, r.k2.goodOrders, r.k3.value], [true, true, 1, false]);
  const cut = checkK2(BIG, { maxNodes: 100 });
  assert.equal(cut.value, null);
  assert.ok(cut.reason.includes('打ち切り'));
});

test('deadline が過去なら（探索が256ノードを超える盤で）null になる', () => {
  const r = checkK2(BIG, { deadline: Date.now() - 1 });
  assert.equal(r.value, null);
  assert.match(r.reason, /打ち切り/);
});

test('クリアできない盤（goal を壁で囲む）は3値とも null', () => {
  const play = { ...BIG, items: [], ice: [], grid: { cols: 5, rows: 5 }, start: { x: 0, y: 4 }, goal: { x: 4, y: 0 }, walls: [{ x: 3, y: 0 }, { x: 4, y: 1 }, { x: 3, y: 1 }] };
  const r = kangaedokoro(play);
  for (const k of [r.k1, r.k2, r.k3]) assert.deepEqual([k.value, k.reason], [null, 'クリアできない盤']);
  assert.deepEqual(formatKangaeLines(r).map((l) => l.split(': ')[1]), Array(3).fill('不明（クリアできない盤）'));
});

test('candidateCount：設計の表', () => {
  const rows = [
    ['teko-01-tsuriai', 'p1', 4, 1], ['teko-04-omosa', 'p1', 3, 1], ['teko-05-ryouhou', 'p2', 9, 2], ['teko-09-oukou', 'p8', 12, 1],
    ['teko-10-zenbu', 'p3', 24, 3], ['teko-07-ukabu', 'p4', 8, 1], ['teko-08-ukabu2', 'p8', 81, 1], ['sort-01-recipe', 'p7', 120, 10],
    ['unfold-01-cube', 'p1', 10, 1], ['unfold-01-cube', 'p8', 715, 54],
  ];
  for (const [l, s, c, n] of rows) {
    const r = candidateCount(loadPlay(l, s));
    assert.deepEqual([r.candidates, r.solutions], [c, n], `${l} ${s}`);
  }
  assert.equal(candidateCount(loadPlay('egg-01-michi', 'p1')), null);
});

test('formatKangaeLines：文言', () => {
  const k = (value, reason = null, extra = {}) => ({ value, reason, ...extra });
  const lines = formatKangaeLines({ k1: k(true, 'ギミックを無視するとゴールに届かない'), k2: k(true, null, { goodOrders: 1, totalOrders: 6 }), k3: k(null, '15秒で打ち切り') });
  assert.deepEqual(lines, [
    '考えどころ K1（素直な最短では解けない）: はい（ギミックを無視するとゴールに届かない）',
    '考えどころ K2（回る順が絞られる）: はい（よい順 1/6）',
    '考えどころ K3（最短でも同じマスを通る）: 不明（15秒で打ち切り）',
  ]);
  const l2 = formatKangaeLines({ k1: k(false), k2: k(false, 'どんぐり2個未満', { goodOrders: 0, totalOrders: null }), k3: k(false) });
  assert.equal(l2[0].split(': ')[1], 'いいえ');
  assert.equal(l2[1].split(': ')[1], 'いいえ（どんぐり2個未満）');
});

test('analyze-board --all：見出し1行＋データ行＋合計1行・各行9列', () => {
  const r = spawnSync(process.execPath, ['tools/analyze-board.mjs', '--all'], { encoding: 'utf-8', timeout: 120_000 });
  assert.equal(r.status, 0, r.stderr);
  const lines = r.stdout.trim().split('\n');
  assert.equal(lines[0].split('\t').length, 9);
  assert.match(lines.at(-1), /^合計: grid \d+面・非grid \d+面・対象外 \d+面/);
  let expected = 0;
  for (const f of readdirSync('lessons').filter((x) => x.endsWith('.json') && x !== 'index.json')) {
    for (const p of JSON.parse(readFileSync(`lessons/${f}`, 'utf-8')).steps.filter((s) => s.kind === 'play')) {
      if ((p.grid && p.start && p.goal) || candidateCount(p)) expected += 1;
    }
  }
  const data = lines.slice(1, -1);
  assert.equal(data.length, expected);
  for (const l of data) assert.equal(l.split('\t').length, 9, l);
});

test('analyze-board の1面出力：grid は K 行、非 grid は候補数', () => {
  const run = (...a) => spawnSync(process.execPath, ['tools/analyze-board.mjs', ...a], { encoding: 'utf-8', timeout: 60_000 });
  const g = run('ice-01-suberu', '1');
  assert.equal(g.status, 0);
  assert.ok(g.stdout.includes('考えどころ K1（素直な最短では解けない）: はい'));
  const n = run('teko-01-tsuriai', '1');
  assert.equal(n.status, 0);
  assert.ok(n.stdout.includes('候補数: 4') && n.stdout.includes('正解数: 1'));
});
