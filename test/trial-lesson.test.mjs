// エディタの試し遊び（Issue #403）：trial 判定・合成レッスン・記録しないことの確認。実行: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isTrialSearch, composeTrialLesson, readTrialStage, TRIAL_KEY } from '../js/trial-lesson.js';

const stage = {
  kind: 'play',
  stepId: 'x1',
  grid: { cols: 3, rows: 3 },
  start: { x: 0, y: 0 },
  goal: { x: 2, y: 2 },
  walls: [],
  allowedCommands: ['up', 'down', 'left', 'right'],
};

test('trial=1 は dev=1 なしでは無視される', () => {
  assert.equal(isTrialSearch('?trial=1'), false);
  assert.equal(isTrialSearch('?dev=1&trial=1'), true);
  assert.equal(isTrialSearch('?dev=1'), false);
});

test('?lesson=ID 併用時は trial を無視する', () => {
  assert.equal(isTrialSearch('?dev=1&trial=1&lesson=cmd-01-susumu'), false);
});

test('合成レッスンは play 1ステップ（最終ステージ・intro なし）', () => {
  const lesson = composeTrialLesson(stage);
  assert.equal(lesson.lessonId, '__trial__');
  assert.equal(lesson.steps.length, 1);
  assert.equal(lesson.steps[0].kind, 'play');
  assert.equal(lesson.steps[0].isFinalStage, true);
  assert.deepEqual(lesson.steps[0].grid, stage.grid);
});

test('合成関数は不正な stage を拒否する', () => {
  assert.throws(() => composeTrialLesson(null));
  assert.throws(() => composeTrialLesson([]));
  assert.throws(() => composeTrialLesson({ ...stage, kind: 'intro' }));
  assert.throws(() => composeTrialLesson({ ...stage, grid: undefined }));
  assert.throws(() => composeTrialLesson({ ...stage, grid: { cols: 0, rows: 3 } }));
  assert.throws(() => composeTrialLesson({ ...stage, start: null }));
  assert.throws(() => composeTrialLesson({ ...stage, goal: { x: 'a', y: 1 } }));
});

test('readTrialStage は無い・JSON 不正で null、正しければ stage を返す', () => {
  const mk = (v) => ({ getItem: (k) => (k === TRIAL_KEY ? v : null) });
  assert.equal(readTrialStage(mk(null)), null);
  assert.equal(readTrialStage(mk('{oops')), null);
  assert.equal(readTrialStage(mk('{"ts":1}')), null);
  assert.deepEqual(readTrialStage(mk(JSON.stringify({ stage, ts: 1 }))), stage);
});

test('trial の recordClear は localStorage に書かない（通常は書く）', async () => {
  const writes = [];
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { writes.push(k); store.set(k, String(v)); },
    removeItem: (k) => { writes.push(k); store.delete(k); },
  };
  globalThis.window = globalThis;
  globalThis.document = { addEventListener() {}, getElementById: () => null };
  globalThis.location = { search: '?dev=1&trial=1' };
  const { recordClear } = await import('../js/ui-clear.js');
  const { initState, S } = await import('../js/state.js');
  initState(composeTrialLesson(stage));
  recordClear({ isFinal: true, stageIndex: 0 });
  recordClear({ isFinal: false, stageIndex: 0 });
  assert.deepEqual(writes, []);
  // 対照：trial でなければ最終クリアで再開点の消去（removeItem）が走る
  globalThis.location = { search: '' };
  S.lesson.lessonId = 'x';
  recordClear({ isFinal: true, stageIndex: 0 });
  assert.ok(writes.length > 0);
});
