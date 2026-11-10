// predict-slider（うかぶ・しずむ）の浮力計算。net・つりあう組・難易度（Issue #288・#710）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buoyancy, netOf, enumerate, difficulty, toolOf } from '../js/engine-buoyancy.js';

const ok = JSON.parse(readFileSync('test/fixtures/buoyancy/710-ok.json', 'utf-8'));
const specs = ok.steps.filter((s) => s.kind === 'play').map((s) => s.buoyancy);

test('engine-buoyancy: toolOf は w/b＋1〜3だけ受ける', () => {
  assert.deepEqual(toolOf('w2'), { kind: 'w', v: 2 });
  assert.deepEqual(toolOf('b3'), { kind: 'b', v: 3 });
  for (const bad of ['w0', 'w4', 'x1', 'w', '', 2, null]) assert.equal(toolOf(bad), null, String(bad));
});

test('engine-buoyancy: net ＝ ring − box + ふうせん − おもり', () => {
  const body = { ring: 2, box: { v: 3 } };
  assert.equal(netOf(body, []), -1);
  assert.equal(netOf(body, ['b2']), 1);
  assert.equal(netOf(body, ['w2', 'b3']), 0);
  assert.equal(netOf({ ring: 4 }, ['w1', 'w3']), 0);
});

test('engine-buoyancy: buoyancy の符号表（浮く／ぴたり／沈む）', () => {
  assert.deepEqual(buoyancy(specs[0], []), { net: 2, nets: [2], dir: 1 });
  assert.deepEqual(buoyancy(specs[0], ['w2']), { net: 0, nets: [0], dir: 0 });
  assert.deepEqual(buoyancy(specs[0], ['w1', 'w2']), { net: -1, nets: [-1], dir: -1 });
});

test('engine-buoyancy: enumerate は全組合せ N=2^n とつりあう組を返す', () => {
  assert.deepEqual(enumerate(specs[0]), { N: 4, solutions: [['w2']] });
  assert.deepEqual(enumerate(specs[1]), { N: 16, solutions: [['w2', 'b3']] });
});

test('engine-buoyancy: つりあう組が無ければ空', () => {
  assert.deepEqual(enumerate({ bodies: [{ ring: 6 }], tools: ['b1', 'b2'] }).solutions, []);
});

test('engine-buoyancy: find:2 は つりあう組が2つ、？のはこも値で計算する', () => {
  assert.equal(specs[2].find, 2);
  assert.deepEqual(enumerate(specs[2]), { N: 16, solutions: [['w1', 'w3'], ['w2', 'w3', 'b1']] });
  const hidden = { bodies: [{ ring: 4, box: { v: 2, hidden: true } }], tools: ['w1', 'w3', 'b1', 'b3'] };
  assert.deepEqual(enumerate(hidden), { N: 16, solutions: [['w3', 'b1']] });
});

test('engine-buoyancy: difficulty は 4,16,16,27（2体は3^n）', () => {
  assert.deepEqual(specs.map(difficulty), [4, 16, 16, 27]);
});

test('engine-buoyancy: 2体は なし／左／右 の3^n を調べ、全体がぴたりの組だけ返す', () => {
  assert.equal(specs[3].bodies.length, 2);
  assert.deepEqual(enumerate(specs[3]), {
    N: 27,
    solutions: [[{ tool: 'w1', body: 1 }, { tool: 'w2', body: 0 }, { tool: 'w3', body: 1 }]],
  });
  const left = [{ tool: 'w2', body: 0 }];
  assert.deepEqual(buoyancy(specs[3], left), { net: 4, nets: [0, 4], dir: 1 });
  assert.deepEqual(buoyancy(specs[3], [...left, { tool: 'w1', body: 1 }, { tool: 'w3', body: 1 }]), { net: 0, nets: [0, 0], dir: 0 });
  assert.deepEqual(buoyancy(specs[3], [{ tool: 'w3', body: 0 }]), { net: -1, nets: [-1, 4], dir: -1 });
});
