// tools/analyze-board.mjs（Issue #299）：最短手数が validate:lessons の判定と一致する・別解数・打ち切り・engine-gridの挙動不変。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { analyzeShortest, countAlternatives, loadPlay } from '../tools/analyze-board.mjs';
import { shortestSteps, boardSpec } from '../js/engine-grid.js';

const lessonFiles = readdirSync('lessons').filter((f) => f.endsWith('.json') && f !== 'index.json');

test('analyze-board: 全レッスンの全playで、最短手数が validate:lessons の判定（maxCommandsとの関係）と一致する', () => {
  let checked = 0;
  for (const file of lessonFiles) {
    const lesson = JSON.parse(readFileSync(`lessons/${file}`, 'utf-8'));
    for (const play of (lesson.steps ?? []).filter((s) => s.kind === 'play')) {
      if (!play.start || !play.goal || !play.grid || typeof play.maxCommands !== 'number') continue;
      const { shortest } = analyzeShortest(play);
      const label = `${file} ${play.stepId}`;
      if (play.repeatBox === true) assert.ok(shortest > play.maxCommands, `${label}: 箱ステージは箱なしの最短(${shortest})がmaxCommandsを超える`);
      else assert.ok(shortest <= play.maxCommands, `${label}: 最短(${shortest})がmaxCommands(${play.maxCommands})以内`);
      if (Array.isArray(play.paint) && play.paint.length > 0) assert.equal(shortest, play.maxCommands, `${label}: paintはmaxCommands＝最短`);
      checked += 1;
    }
  }
  assert.ok(checked > 20, `検査したplay数=${checked}`);
});

test('analyze-board: paint-01 の最短手数6/10/12と別解2/2/4本（stepIdでもステージ番号でも引ける）', () => {
  const expected = { p1: [6, 2], p2: [10, 2], p3: [12, 4] };
  Object.entries(expected).forEach(([id, [dist, alts]], i) => {
    const play = loadPlay('paint-01-nuru', i + 1);
    assert.deepEqual(loadPlay('paint-01-nuru', id), play);
    assert.equal(play.stepId, id);
    assert.equal(analyzeShortest(play).shortest, dist);
    const a = countAlternatives(play);
    assert.equal(a.count, alts);
    assert.equal(a.truncated, false);
  });
});

test('analyze-board: 訪問状態数を返す・limitで打ち切りを明示・存在しないステージは例外', () => {
  const play = loadPlay('paint-01-nuru', 3);
  assert.ok(analyzeShortest(play).visited > 0);
  const cut = countAlternatives(play, { limit: 1 });
  assert.equal(cut.count, 1);
  assert.equal(cut.truncated, true);
  assert.match(cut.reason, /打ち切り/);
  assert.throws(() => loadPlay('paint-01-nuru', 99), /ありません/);
});

test('engine-grid: shortestSteps に stats を渡しても最短手数は変わらない（既存の挙動不変）', () => {
  for (const file of lessonFiles) {
    const lesson = JSON.parse(readFileSync(`lessons/${file}`, 'utf-8'));
    for (const play of (lesson.steps ?? []).filter((s) => s.kind === 'play')) {
      if (!play.start || !play.goal || !play.grid) continue;
      const spec = boardSpec(play);
      const stats = {};
      assert.equal(shortestSteps(spec, stats), shortestSteps(spec), `${file} ${play.stepId}`);
      assert.ok(Number.isInteger(stats.visited));
    }
  }
});
