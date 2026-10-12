// 練習の gimmickMix（js/engine-generate.js の generateMap）と、validate-lessons の gimmickMix 検査の単体テスト（Issue #266）。
// リポジトリ直下で実行すること（npm run test:unit）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generateMap } from '../js/engine-generate.js';
import { validateLesson } from '../tools/validate-lessons.mjs';

const lesson = JSON.parse(readFileSync('lessons/cmd-06-practice.json', 'utf-8'));
const clone = (x) => JSON.parse(JSON.stringify(x));
const mixGenerator = lesson.steps[1].generator;
const plainGenerator = (() => {
  const g = clone(mixGenerator);
  delete g.gimmickMix;
  return g;
})();
const positiveIntOr = (v, d) => (/^[1-9]\d*$/.test(String(v ?? '').trim()) ? Number(String(v).trim()) : d);
const seedCount = Math.min(1000, positiveIntOr(process.env.GENERATE_SEEDS, 1000));
const ALL = new Set(['items', 'ice', 'keys']);

test('gimmickMix: cmd-06 の p1 に items・ice・keys の gimmickMix がある', () => {
  assert.deepEqual(Object.keys(mixGenerator.gimmickMix), ['items', 'ice', 'keys', 'keyMode']);
  assert.equal(mixGenerator.gimmickMix.keyMode, 'remote', 'Issue #391: cmd-06 は remote を明示');
});

test('gimmickMix: 同じ seed・同じ allowed なら同じ盤面（決定性）', () => {
  for (let s = 0; s < 200; s += 1) {
    for (const allowed of [ALL, new Set(), new Set(['ice']), undefined]) {
      assert.equal(
        JSON.stringify(generateMap(mixGenerator, s, { allowed })),
        JSON.stringify(generateMap(mixGenerator, s, { allowed }))
      );
    }
  }
});

// gimmickMix 無指定の盤面は変更前の engine-generate.js の出力と同じ（rng を消費しない）。値は変更前のコードで採取。
const compact = (m) => JSON.stringify({ start: m.start, goal: m.goal, walls: m.walls, items: m.items, ice: m.ice, keys: m.keys, doors: m.doors, solution: m.solution });
const otherGenerator = {
  grid: { cols: 6, rows: 6 }, walls: { min: 2, max: 4 }, shortestPath: { min: 5, max: 14 }, minTurns: 1,
  wallsMustMatter: true, maxCommandsSlack: 2, items: { min: 1, max: 2 }, itemsMustMatter: true,
  ice: { min: 1, max: 1 }, keys: { min: 1, max: 1 }, keysMustMatter: true,
};

test('gimmickMix 無指定: cmd-06 から gimmickMix を外した generator の盤面は変更前と同じ', () => {
  const golden = {
    0: '{"start":{"x":3,"y":1},"goal":{"x":3,"y":3},"walls":[{"x":3,"y":2}],"items":[],"solution":["left","down","down","right"]}',
    5: '{"start":{"x":2,"y":0},"goal":{"x":2,"y":3},"walls":[{"x":2,"y":2},{"x":1,"y":3}],"items":[],"solution":["down","right","down","down","left"]}',
    123: '{"start":{"x":4,"y":2},"goal":{"x":1,"y":2},"walls":[{"x":2,"y":0},{"x":2,"y":2}],"items":[],"solution":["left","up","left","left","down"]}',
  };
  for (const [s, json] of Object.entries(golden)) {
    assert.equal(compact(generateMap(plainGenerator, Number(s))), json, `シード${s}`);
    assert.equal(compact(generateMap(plainGenerator, Number(s), { allowed: new Set() })), json, `シード${s}（allowed 空でも同じ）`);
  }
});

test('gimmickMix 無指定: items・ice・keys を直接指定した別の generator の盤面も変更前と同じ', () => {
  const golden = {
    0: '{"start":{"x":1,"y":3},"goal":{"x":4,"y":3},"walls":[{"x":3,"y":5},{"x":3,"y":2},{"x":2,"y":0},{"x":3,"y":1}],"items":[{"x":4,"y":2}],"ice":[{"x":2,"y":1}],"keys":[{"x":1,"y":2,"color":"red"}],"doors":[{"x":2,"y":3,"color":"red"}],"solution":["down","right","right","right","up","up","down"]}',
    5: '{"start":{"x":0,"y":2},"goal":{"x":2,"y":2},"walls":[{"x":1,"y":0},{"x":2,"y":3}],"items":[{"x":5,"y":3}],"ice":[{"x":1,"y":1}],"keys":[{"x":2,"y":4,"color":"blue"}],"doors":[{"x":1,"y":2,"color":"blue"}],"solution":["up","right","right","right","right","down","down","up","left","left","left"]}',
  };
  for (const [s, json] of Object.entries(golden)) {
    assert.equal(compact(generateMap(otherGenerator, Number(s))), json, `シード${s}`);
  }
});

test('gimmickMix: allowed が空 Set なら 1000 seed の盤に items・ice・keys・doors が出ない', () => {
  for (let s = 0; s < seedCount; s += 1) {
    const m = generateMap(mixGenerator, s, { allowed: new Set() });
    assert.equal(m.fallback, false, `シード${s}が予備盤面`);
    assert.equal(m.items.length, 0, `シード${s}に items`);
    assert.ok(!m.ice?.length, `シード${s}に ice`);
    assert.ok(!m.keys?.length && !m.doors?.length, `シード${s}に keys・doors`);
  }
});

test('gimmickMix: allowed が一部なら、その種類だけが出る', () => {
  const seen = { items: 0, ice: 0, keys: 0 };
  for (let s = 0; s < seedCount; s += 1) {
    const m = generateMap(mixGenerator, s, { allowed: new Set(['ice']) });
    assert.equal(m.items.length, 0, `シード${s}に items`);
    assert.ok(!m.keys?.length, `シード${s}に keys`);
    if (m.ice?.length) seen.ice += 1;
  }
  assert.ok(seen.ice > 0, 'ice が1回も出ない');
});

// 固定シード（生の数値 seed 0〜1023）の fallback 率 ≤0.5%（≤5 件）。既知の fallback seed は 33・273（現設定での実測。683 は ice 2個の旧設定）。
test('gimmickMix: allowed 省略（全許可）で 3 種類とも出て、固定シード 0〜1023 の予備盤面は 0.5% 以下', () => {
  const seen = { items: 0, ice: 0, keys: 0 };
  const fallbacks = [];
  for (let s = 0; s < 1024; s += 1) {
    const m = generateMap(mixGenerator, s);
    if (m.fallback) fallbacks.push(s);
    assert.ok(m.attempts >= 1 && m.attempts <= 400, `シード${s} attempts=${m.attempts}`);
    if (m.items.length) seen.items += 1;
    if (m.ice?.length) seen.ice += 1;
    if (m.keys?.length) seen.keys += 1;
  }
  assert.ok(fallbacks.length <= 5, `予備盤面 ${fallbacks.length}/1024 件（上限5）: ${fallbacks.join(',')}`);
  assert.ok(seen.items > 0 && seen.ice > 0 && seen.keys > 0, JSON.stringify(seen));
});

// --- validate-lessons の gimmickMix 検査（review/design/266/boards の 266-fail 1〜3件目・266-pass） ---
const mixErrors = (gimmickMix) => {
  const data = clone(lesson);
  if (gimmickMix === undefined) delete data.steps[1].generator.gimmickMix;
  else data.steps[1].generator.gimmickMix = gimmickMix;
  return validateLesson('cmd-06-practice.json', data).filter((e) => e.includes('gimmickMix'));
};

test('gimmickMix 検査: 現行の cmd-06-practice（266-pass）と gimmickMix 省略は合格', () => {
  assert.deepEqual(validateLesson('cmd-06-practice.json', clone(lesson)), []);
  assert.deepEqual(mixErrors(undefined), []);
});

test('gimmickMix 検査: 空オブジェクト（266-fail 1件目）は不合格', () => {
  assert.equal(mixErrors({}).length, 1);
});

test('gimmickMix 検査: 未知の種類（266-fail 2件目）は不合格', () => {
  assert.equal(mixErrors({ fire: { items: { min: 1, max: 1 } } }).length, 1);
});

test('gimmickMix 検査: 値がオブジェクトでない（配列。266-fail 3件目）は不合格', () => {
  assert.equal(mixErrors({ items: ['items'] }).length, 1);
});

test('gimmickMix 検査: 値が空オブジェクト・gimmickMix が配列は不合格', () => {
  assert.equal(mixErrors({ items: {} }).length, 1);
  assert.equal(mixErrors([]).length, 1);
});
