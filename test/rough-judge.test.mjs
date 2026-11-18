import test from 'node:test';
import assert from 'node:assert/strict';
import {
  overflowItems, overlapPairs, smallTargets, doubleResult, boardResized,
  jumps, internalIds, filterKnown, formatFinding,
} from '../tools/playtest/rough-judge.mjs';

test('R1 overflowItems: clientWidth+1 を超えたものだけ', () => {
  const r = overflowItems([{ where: 'a', scrollWidth: 101, clientWidth: 100 }, { where: 'b', scrollWidth: 102, clientWidth: 100 }]);
  assert.deepEqual(r.map((i) => i.where), ['b']);
});

test('R2 overlapPairs: 9px ずらしで1組、10px 隣接で0組', () => {
  const a = { where: 'a', x: 0, y: 0, w: 10, h: 10 };
  assert.equal(overlapPairs([a, { where: 'b', x: 9, y: 9, w: 10, h: 10 }]).length, 1);
  assert.equal(overlapPairs([a, { where: 'b', x: 10, y: 0, w: 10, h: 10 }]).length, 0);
});

test('R3 smallTargets: 短辺48未満', () => {
  const r = smallTargets([{ w: 47, h: 64 }, { w: 48, h: 48 }]);
  assert.deepEqual(r, [{ w: 47, h: 64 }]);
});

test('R4 doubleResult', () => {
  assert.equal(doubleResult(1), false);
  assert.equal(doubleResult(2), true);
});

test('R5 boardResized: 10%まで偽・超で真', () => {
  assert.equal(boardResized({ w: 100, h: 100 }, { w: 110, h: 100 }), false);
  assert.equal(boardResized({ w: 100, h: 100 }, { w: 111, h: 100 }), true);
  assert.equal(boardResized({ w: 100, h: 100 }, { w: 100, h: 89 }), true);
});

test('R6 jumps: cell 以上の飛びの添字', () => {
  const s = [{ t: 0, x: 0, y: 0 }, { t: 100, x: 30, y: 0 }, { t: 200, x: 100, y: 0 }];
  assert.deepEqual(jumps(s, 64), [2]);
});

test('R10 internalIds', () => {
  assert.deepEqual(internalIds('p1 の けっか s12 step1 t3'), ['p1', 's12', 't3']);
});

test('filterKnown: rule・where が一致する件だけ除く', () => {
  const f = [{ rule: 'R1', where: 'x' }, { rule: 'R1', where: 'y' }, { rule: 'R2', where: 'x' }];
  assert.deepEqual(filterKnown(f, [{ rule: 'R1', where: 'x', issue: 1 }]), [{ rule: 'R1', where: 'y' }, { rule: 'R2', where: 'x' }]);
});

test('formatFinding: cmd-01 の solution の並びと id=" を含まない', async () => {
  const { readFileSync } = await import('node:fs');
  const lesson = JSON.parse(readFileSync(new URL('../lessons/cmd-01-susumu.json', import.meta.url), 'utf8'));
  const out = JSON.stringify(formatFinding({ rule: 'R1', where: 'cmd-01-susumu/p1/1280x800/intro', detail: 'scrollWidth 120>100' }));
  for (const s of lesson.steps.filter((x) => x.solution)) {
    assert.ok(!out.includes(JSON.stringify(s.solution)));
  }
  assert.ok(!out.includes('id="'));
  assert.deepEqual(Object.keys(JSON.parse(out)), ['rule', 'where', 'detail']);
});
