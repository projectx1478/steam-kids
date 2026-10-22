// switches の mode 混在（Issue #530 段1）：混在盤の検査（自分だけ外した盤で既存3種）と、描画と判定の一致。
// 盤は test/fixtures/switch-mix/。ok は混在で合格、ng は理由が1つだけ。実行: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { switches, isWallAt } from '../js/gimmicks/switches.js';
import { boardSpec, shortestSteps } from '../js/engine-grid.js';
import { checkBoard, checkSwitchMatters } from '../tools/validate-lessons.mjs';

const load = (name) => JSON.parse(readFileSync(new URL(`./fixtures/switch-mix/${name}.json`, import.meta.url), 'utf-8'));

function run(board) {
  const errors = [];
  const add = (cat, msg) => errors.push(`${cat}: ${msg}`);
  checkBoard(board, add, '');
  const boardErrors = errors.length;
  checkSwitchMatters(board, shortestSteps(boardSpec(board)), add, '');
  return { errors, boardErrors };
}

test('混在盤 ok-switch-mixed：checkBoard も checkSwitchMatters（混在分岐）も合格し、1秒以内', () => {
  const t0 = Date.now();
  const r = run(load('ok-switch-mixed'));
  assert.deepEqual(r.errors, []);
  assert.ok(Date.now() - t0 < 1000, `${Date.now() - t0}ms`);
  assert.equal(shortestSteps(boardSpec(load('ok-switch-mixed'))), 9);
});

test('混在盤の不合格：openを外しても解ける（必須でない）／closeが最短経路上に無い（罠が飾り）', () => {
  const open = run(load('ng-open-bypass'));
  assert.equal(open.boardErrors, 0, open.errors.join('\n'));
  assert.equal(open.errors.length, 1, open.errors.join('\n'));
  assert.match(open.errors[0], /スイッチの必須性.*switches\[0\] を踏まずに/);
  const close = run(load('ng-close-off-path'));
  assert.equal(close.boardErrors, 0, close.errors.join('\n'));
  assert.equal(close.errors.length, 1, close.errors.join('\n'));
  assert.match(close.errors[0], /スイッチの罠の意味.*switches\[1\] を外した盤の最短\(7\)より最短\(7\)が長くない/);
});

// --- 描画と判定の一致：onStep の描画（data-switch-wall）が、blocks と同じ述語（isWallAt）の壁集合に踏み順ごと一致する ---
globalThis.matchMedia = () => ({ matches: true });
globalThis.document = { createElement: () => ({ set innerHTML(h) { this.content = { firstElementChild: { html: h, replaceWith() {} } }; } }) };

function fakeCell() {
  const stub = { replaceWith() {} };
  return { dataset: {}, insertAdjacentHTML() {}, getAnimations: () => [], querySelector: (sel) => (sel === '.grid-ice-svg' ? null : stub) };
}

const P = (x, y) => ({ x, y });
// open(0)・close(1)・toggle(2)の混在。壁(2,1)は open と close の重なり、(3,1)は toggle（initial open＝初期は床）。
const SPEC = {
  grid: { cols: 5, rows: 3 },
  switches: [
    { x: 0, y: 0, mode: 'open', targets: [P(1, 1), P(2, 1)] },
    { x: 0, y: 1, mode: 'close', targets: [P(2, 1), P(4, 2)] },
    { x: 0, y: 2, mode: 'toggle', targets: [{ ...P(3, 1), initial: 'open' }, { ...P(4, 1), initial: 'closed' }] },
  ],
};
const TARGETS = [P(1, 1), P(2, 1), P(4, 2), P(3, 1), P(4, 1)];

function setup() {
  const cellMap = new Map();
  const board = { querySelector: (sel) => { const m = sel.match(/data-x="(\d+)"\]\[data-y="(\d+)"/); const k = `${m[1]},${m[2]}`; if (!cellMap.has(k)) cellMap.set(k, fakeCell()); return cellMap.get(k); } };
  const els = switches.render({ board, switches: SPEC.switches });
  return { els, view: { gimmickEls: { switches: els } } };
}

test('描画と判定の一致：混在盤で、初期と全踏み順（長さ4まで）の各手で wall の on/off が blocks の述語と一致する', () => {
  const sws = SPEC.switches;
  const seqs = [[]];
  for (let len = 1; len <= 4; len++) for (const s of seqs.filter((q) => q.length === len - 1)) for (let i = 0; i < 3; i++) seqs.push([...s, i]);
  for (const seq of seqs) {
    const { els, view } = setup();
    const runState = {};
    const check = (label) => {
      const pressed = [...(runState.pressed ?? [])];
      for (const t of TARGETS) {
        const expected = isWallAt((i) => pressed.includes(i), SPEC, t);
        assert.equal(switches.blocks({ pressed }, t, SPEC), expected, `blocks ${label} ${t.x},${t.y}`);
        assert.equal(els.wallCells.get(`${t.x},${t.y}`).dataset.switchWall === 'on', expected, `${label} (${t.x},${t.y}) 踏み順=${seq}`);
      }
    };
    check('初期');
    seq.forEach((i, n) => {
      switches.onStep({ pos: P(sws[i].x, sws[i].y), spec: SPEC, view, run: runState });
      check(`${n + 1}手目`);
    });
  }
});
