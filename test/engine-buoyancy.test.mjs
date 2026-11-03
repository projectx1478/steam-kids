// predict-slider（うかぶ・しずむ）の浮力計算。net の符号・つりあう組・難易度（Issue #288）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buoyancy, solutionPairs, difficulty } from '../js/engine-buoyancy.js';

const ok = JSON.parse(readFileSync('test/fixtures/buoyancy/288-ok.json', 'utf-8'));
const specs = ok.steps.filter((s) => s.kind === 'play').map((s) => s.buoyancy);

test('engine-buoyancy: net の符号表（浮く／ぴたり／沈む）', () => {
  assert.deepEqual(buoyancy(specs[0], 1, 0), { net: 1, dir: 1 });
  assert.deepEqual(buoyancy(specs[0], 2, 0), { net: 0, dir: 0 });
  assert.deepEqual(buoyancy(specs[0], 3, 0), { net: -1, dir: -1 });
  assert.deepEqual(buoyancy(specs[2], 1, 0), { net: -1, dir: -1 }, 'p3 の start は沈む');
});

test('engine-buoyancy: mass・lift の省略時は1', () => {
  assert.equal(buoyancy({ base: 3 }, 1, 2).net, 4);
});

test('engine-buoyancy: solutionPairs は p1〜p3 で1組ずつ', () => {
  assert.deepEqual(solutionPairs(specs[0]), [{ weights: 2, balloons: 0 }]);
  assert.deepEqual(solutionPairs(specs[1]), [{ weights: 3, balloons: 0 }]);
  assert.deepEqual(solutionPairs(specs[2]), [{ weights: 2, balloons: 2 }]);
});

test('engine-buoyancy: つりあう組が無ければ空', () => {
  assert.deepEqual(solutionPairs({ base: 8, weights: { start: 1, max: 3 } }), []);
});

test('engine-buoyancy: difficulty は 2,3,4', () => {
  assert.deepEqual(specs.map(difficulty), [2, 3, 4]);
});
