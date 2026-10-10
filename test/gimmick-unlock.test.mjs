// clearedGimmicks（js/gimmick-unlock.js）と、index.json の単元 gimmicks 検査（validate-lessons）の単体テスト（Issue #266）。
// リポジトリ直下で実行すること（npm run test:unit）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { clearedGimmicks } from '../js/gimmick-unlock.js';
import { validateIndex } from '../tools/validate-lessons.mjs';

const units = [
  { unitId: 'donguri', gimmicks: ['items'], lessonIds: ['d1', 'd2'], practiceIds: ['dp'], devOnlyIds: ['dd'] },
  { unitId: 'ice', gimmicks: ['ice'], lessonIds: ['i1'] },
  { unitId: 'commands', lessonIds: ['c1'] },
];

test('clearedGimmicks: 単元の1本でもクリアなら、その単元の gimmicks が入る', () => {
  const s = clearedGimmicks(units, (id) => id === 'd2');
  assert.deepEqual([...s], ['items']);
});

test('clearedGimmicks: practiceIds・devOnlyIds は数えない', () => {
  assert.equal(clearedGimmicks(units, (id) => id === 'dp' || id === 'dd').size, 0);
});

test('clearedGimmicks: gimmicks の無い単元をクリアしても何も入らない', () => {
  assert.equal(clearedGimmicks(units, (id) => id === 'c1').size, 0);
});

test('clearedGimmicks: units が null・undefined・空なら空 Set', () => {
  for (const u of [null, undefined, []]) {
    const s = clearedGimmicks(u, () => true);
    assert.ok(s instanceof Set);
    assert.equal(s.size, 0);
  }
});

// --- index.json の gimmicks 検査 ---
const realIndex = JSON.parse(readFileSync('lessons/index.json', 'utf-8'));
const lessonById = new Map();
const fileIds = new Set();
for (const f of readdirSync('lessons')) {
  if (!f.endsWith('.json') || f === 'index.json') continue;
  const d = JSON.parse(readFileSync(`lessons/${f}`, 'utf-8'));
  lessonById.set(d.lessonId, d);
  fileIds.add(f.replace(/\.json$/, ''));
}
const clone = (x) => JSON.parse(JSON.stringify(x));
const gimmickErrors = (index) =>
  validateIndex(index, lessonById, fileIds).filter((e) => e.startsWith('index.json: gimmicks:'));
function withIceGimmicks(value) {
  const idx = clone(realIndex);
  const ice = idx.tracks.flatMap((t) => t.units).find((u) => u.unitId === 'ice');
  ice.gimmicks = value;
  return idx;
}

test('index gimmicks: 現行の index.json は合格', () => {
  assert.deepEqual(validateIndex(clone(realIndex), lessonById, fileIds), []);
});

test('index gimmicks: 266-pass.json の indexUnitsGimmicks（donguri・ice・keys）は合格', () => {
  const idx = clone(realIndex);
  const want = { donguri: ['items'], ice: ['ice'], keys: ['keys'] };
  for (const u of idx.tracks.flatMap((t) => t.units)) {
    if (want[u.unitId]) assert.deepEqual(u.gimmicks, want[u.unitId], u.unitId);
    else assert.ok(!('gimmicks' in u), `${u.unitId} に gimmicks が付いている`);
  }
  assert.equal(gimmickErrors(idx).length, 0);
});

test('index gimmicks: 未知の値（266-fail 4件目）は不合格', () => {
  assert.equal(gimmickErrors(withIceGimmicks(['fire'])).length, 1);
});

test('index gimmicks: 配列でない値（266-fail 5件目）は不合格', () => {
  assert.equal(gimmickErrors(withIceGimmicks('ice')).length, 1);
});
