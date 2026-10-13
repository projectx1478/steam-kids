// #397 段4: 盤面エディタの状態管理（置く・消す・動かす・元に戻す・やり直し、拒否値）。実行: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState, setCellPx, setGrid, place, erase, move, undo, redo, HISTORY_MAX } from '../tools/editor/editor-state.js';
import { SAMPLE_SPEC, EDITOR_MAX_SIZE } from '../tools/editor/editor-view.js';

const fresh = () => createState(SAMPLE_SPEC);
const snap = (v) => JSON.parse(JSON.stringify(v));

test('editor-state: 置く→消す→元に戻す で元の spec と一致', () => {
  const s = fresh();
  const original = snap(s.spec);
  assert.equal(place(s, 'wall', 4, 4).ok, false); // ゴールの上
  assert.equal(place(s, 'wall', 2, 1).ok, true);
  assert.ok(s.spec.walls.some((c) => c.x === 2 && c.y === 1));
  assert.equal(erase(s, 2, 1).ok, true);
  assert.deepEqual(s.spec.walls, original.walls);
  assert.equal(undo(s).ok, true);
  assert.equal(undo(s).ok, true);
  assert.deepEqual(s.spec, original);
  assert.equal(redo(s).ok, true);
  assert.ok(s.spec.walls.some((c) => c.x === 2 && c.y === 1));
});

test('editor-state: 重なりの拒否（状態は変わらない）', () => {
  const s = fresh();
  const before = snap(s);
  assert.equal(place(s, 'wall', 1, 0).ok, false); // 壁の上に壁
  assert.equal(place(s, 'items', 1, 0).ok, false); // 壁の上にアイテム
  assert.equal(place(s, 'start', 4, 4).ok, false); // ゴールの上
  assert.equal(place(s, 'wall', 9, 9).ok, false); // 盤外
  assert.deepEqual(s, before);
});

test('editor-state: スタート・ゴールは各1個（置くと移る）、消せない', () => {
  const s = fresh();
  assert.equal(place(s, 'start', 0, 1).ok, true);
  assert.deepEqual(s.spec.start, { x: 0, y: 1 });
  assert.equal(erase(s, 0, 1).ok, false);
  assert.equal(erase(s, 4, 4).ok, false);
});

test('editor-state: 動かす（移動先に要素があれば拒否）', () => {
  const s = fresh();
  const before = snap(s.spec);
  assert.equal(move(s, 1, 0, 1, 1).ok, false); // 壁→壁
  assert.equal(move(s, 1, 0, 0, 0).ok, false); // 壁→スタート
  assert.deepEqual(s.spec, before);
  assert.equal(move(s, 1, 0, 2, 1).ok, true);
  assert.ok(s.spec.walls.some((c) => c.x === 2 && c.y === 1));
  assert.ok(!s.spec.walls.some((c) => c.x === 1 && c.y === 0));
  assert.equal(move(s, 0, 0, 0, 1).ok, true); // スタートも動く
  assert.deepEqual(s.spec.start, { x: 0, y: 1 });
  assert.equal(move(s, 3, 3, 3, 3).ok, false); // 同じマスは移動先に要素がある扱い
});

test('editor-state: 組・設定が要る要素は置けない・消せない・動かせない', () => {
  const s = fresh();
  for (const key of ['keys', 'switches', 'paint', 'periodic']) assert.equal(place(s, key, 2, 1).ok, false, key);
  assert.equal(erase(s, 0, 2).ok, false); // かぎ
  assert.equal(move(s, 2, 2, 2, 1).ok, false); // ドア
});

test('editor-state: 単純なギミック（items・ice・cushion・water）は置ける。空になった配列は消える', () => {
  for (const key of ['items', 'ice', 'cushion', 'water']) {
    const s = createState({ grid: { cols: 3, rows: 3 }, start: { x: 0, y: 0 }, goal: { x: 2, y: 2 }, walls: [] });
    assert.equal(place(s, key, 1, 1).ok, true, key);
    assert.deepEqual(s.spec[key], [{ x: 1, y: 1 }]);
  }
  const t = createState({ grid: { cols: 3, rows: 3 }, start: { x: 0, y: 0 }, goal: { x: 2, y: 2 }, walls: [] });
  assert.equal(place(t, 'water', 1, 1).ok, true);
  assert.deepEqual(t.spec.water, [{ x: 1, y: 1 }]);
  assert.equal(erase(t, 1, 1).ok, true);
  assert.equal('water' in t.spec, false);
});

test('editor-state: cellPx は整数のみ・8〜128', () => {
  const s = fresh();
  for (const bad of [63.5, NaN, Infinity, '64', null, undefined, 7, 0, -1, 129, 1000]) {
    assert.equal(setCellPx(s, bad).ok, false, String(bad));
    assert.equal(s.cellPx, 64);
  }
  assert.equal(setCellPx(s, 8).ok, true);
  assert.equal(setCellPx(s, 128).ok, true);
  assert.equal(s.cellPx, 128);
});

test('editor-state: 範囲外の undo/redo は何もしない', () => {
  const s = fresh();
  assert.equal(undo(s).ok, false);
  assert.equal(redo(s).ok, false);
  assert.equal(s.cursor, 0);
  place(s, 'wall', 2, 1);
  assert.equal(redo(s).ok, false);
  assert.equal(s.cursor, 1);
  undo(s);
  assert.equal(undo(s).ok, false);
  assert.equal(s.cursor, 0);
  assert.equal(s.history.length, 2);
});

test('editor-state: 途中で戻って新しい編集をすると cursor より後ろは破棄', () => {
  const s = fresh();
  place(s, 'wall', 2, 1);
  place(s, 'wall', 3, 2);
  undo(s);
  undo(s);
  assert.equal(place(s, 'ice', 1, 3).ok, true);
  assert.equal(s.history.length, 2);
  assert.equal(s.cursor, 1);
  assert.equal(redo(s).ok, false);
});

test('editor-state: history は100まで。超えたら先頭から捨てる', () => {
  assert.equal(HISTORY_MAX, 100);
  const t = createState({ grid: { cols: 6, rows: 1 }, start: { x: 0, y: 0 }, goal: { x: 5, y: 0 }, walls: [] });
  const firstSnapshot = snap(t.history[0]);
  for (let i = 0; i < 150; i++) assert.equal((i % 2 === 0 ? place(t, 'wall', 2, 0) : erase(t, 2, 0)).ok, true);
  assert.equal(t.history.length, HISTORY_MAX);
  assert.equal(t.cursor, HISTORY_MAX - 1);
  // 先頭（元の spec）は捨てられている。150回目の後は壁なし(偶数回目の消す)だが、先頭は 51 件目の状態
  assert.notDeepEqual(t.history[0], firstSnapshot);
  assert.deepEqual(t.history[0], { grid: { cols: 6, rows: 1 }, start: { x: 0, y: 0 }, goal: { x: 5, y: 0 }, walls: [{ x: 2, y: 0 }] });
  // 戻れるのは 99 回まで
  let n = 0;
  while (undo(t).ok) n++;
  assert.equal(n, HISTORY_MAX - 1);
});

test('editor-state: EDITOR_MAX_SIZE を超える盤面の変更は拒否', () => {
  const s = fresh();
  assert.equal(setGrid(s, EDITOR_MAX_SIZE + 1, 5).ok, false);
  assert.equal(setGrid(s, 5, EDITOR_MAX_SIZE + 1).ok, false);
  assert.equal(setGrid(s, 0, 5).ok, false);
  assert.equal(setGrid(s, 5.5, 5).ok, false);
  assert.equal(setGrid(s, 3, 3).ok, false); // ゴールなど要素が盤外になる
  assert.deepEqual(s.spec.grid, { cols: 5, rows: 5 });
  assert.equal(setGrid(s, EDITOR_MAX_SIZE, EDITOR_MAX_SIZE).ok, true);
  assert.deepEqual(s.spec.grid, { cols: 6, rows: 6 });
});

// ---- #402 段2: レッスンの面の一覧・並べ替え・固定 ----
import { createLessonState, selectStep, loadSpec, moveStep, replaceStep, removeStep, duplicateStep, pinStep, duplicateBoards } from '../tools/editor/editor-state.js';

const board = (extra = {}) => ({ grid: { cols: 3, rows: 3 }, start: { x: 0, y: 0 }, goal: { x: 2, y: 2 }, walls: [{ x: 1, y: 1 }], ...extra });
const lessonSteps = () => [
  { stepId: 'i1', kind: 'intro', text: 'せつめい', demo: board() },
  { stepId: 'p1', kind: 'play', ...board(), solution: ['right'], maxCommands: 5 },
  { stepId: 'p2', kind: 'play', ...board({ walls: [{ x: 0, y: 1 }] }), gen: { seed: 3, ver: 1 } },
  { stepId: 'p3', kind: 'play', ...board({ walls: [{ x: 0, y: 2 }] }) },
];

test('editor-state(面): 選択は盤面のある面だけ。盤面なしと範囲外は拒否', () => {
  const ls = createLessonState('x', lessonSteps());
  assert.equal(selectStep(ls, 0).ok, false);
  assert.equal(selectStep(ls, 9).ok, false);
  assert.equal(ls.selected, null);
  const r = selectStep(ls, 1);
  assert.equal(r.ok, true);
  assert.equal(ls.selected, 1);
  r.value.walls.push({ x: 2, y: 0 });
  assert.equal(ls.steps[1].walls.length, 1); // 返り値はコピー
  const st = fresh();
  loadSpec(st, ls.steps[1]);
  assert.equal(st.cursor, 0);
  assert.equal(st.history.length, 1);
  assert.deepEqual(st.spec, ls.steps[1]);
});

test('editor-state(面): 上下移動は選択中の面を追い続け、端は拒否', () => {
  const ls = createLessonState('x', lessonSteps());
  selectStep(ls, 1);
  assert.equal(moveStep(ls, 1, -1).ok, true);
  assert.deepEqual(ls.steps.map((s) => s.stepId), ['p1', 'i1', 'p2', 'p3']);
  assert.equal(ls.selected, 0);
  assert.equal(moveStep(ls, 0, -1).ok, false);
  assert.equal(moveStep(ls, 3, 1).ok, false);
  assert.equal(moveStep(ls, 1, 2).ok, false);
  moveStep(ls, 1, 1); // 選択外の2面が入れ替わっても選択は p1 のまま
  assert.equal(ls.steps[ls.selected].stepId, 'p1');
});

test('editor-state(面): 複製して追加は stepId が重ならず、直後に入って選ばれる', () => {
  const ls = createLessonState('x', lessonSteps());
  assert.equal(duplicateStep(ls, 1).ok, true);
  assert.equal(ls.steps[2].stepId, 'p1-copy');
  assert.equal(ls.selected, 2);
  duplicateStep(ls, 1);
  assert.equal(ls.steps[2].stepId, 'p1-copy2');
  assert.equal(new Set(ls.steps.map((s) => s.stepId)).size, ls.steps.length);
  assert.equal(duplicateStep(ls, 99).ok, false);
});

test('editor-state(面): 置き換えは盤面だけ差し替え stepId・kind を保つ。盤面なしは拒否', () => {
  const ls = createLessonState('x', lessonSteps());
  const st = fresh();
  assert.equal(replaceStep(ls, 3, { walls: [] }).ok, false);
  assert.equal(replaceStep(ls, 3, st.spec).ok, true);
  assert.equal(ls.steps[3].stepId, 'p3');
  assert.equal(ls.steps[3].kind, 'play');
  assert.deepEqual(ls.steps[3].grid, st.spec.grid);
  assert.equal(replaceStep(ls, 7, st.spec).ok, false);
});

test('editor-state(面): 削除は選択を追い、最後の1面は拒否', () => {
  const ls = createLessonState('x', lessonSteps());
  selectStep(ls, 3);
  assert.equal(removeStep(ls, 1).ok, true);
  assert.equal(ls.steps[ls.selected].stepId, 'p3');
  removeStep(ls, ls.selected);
  assert.equal(ls.selected, null);
  const one = createLessonState('x', [lessonSteps()[1]]);
  assert.equal(removeStep(one, 0).ok, false);
  assert.equal(one.steps.length, 1);
});

test('editor-state(面): 固定は gen を捨てて盤面は変えない。gen が無い面は拒否', () => {
  const ls = createLessonState('x', lessonSteps());
  const before = JSON.parse(JSON.stringify(ls.steps[2]));
  assert.equal(pinStep(ls, 2).ok, true);
  assert.equal('gen' in ls.steps[2], false);
  delete before.gen;
  assert.deepEqual(ls.steps[2], before);
  assert.equal(pinStep(ls, 2).ok, false);
  assert.equal(pinStep(ls, 3).ok, false);
});

test('editor-state(面): 同盤面の重複を並び順に依らず検出（solution・gen の違いは無視）', () => {
  const steps = lessonSteps();
  steps.push({ stepId: 'p4', kind: 'play', ...board({ walls: [{ x: 1, y: 1 }] }), solution: ['down'], gen: { seed: 1, ver: 1 } });
  steps.push({ stepId: 'p5', kind: 'play', ...board({ walls: [{ x: 0, y: 2 }, { x: 1, y: 1 }] }) });
  steps.push({ stepId: 'p6', kind: 'play', ...board({ walls: [{ x: 1, y: 1 }, { x: 0, y: 2 }] }) });
  assert.deepEqual(duplicateBoards(steps), [[1, 4], [5, 6]]);
  assert.deepEqual(duplicateBoards(lessonSteps()), []);
});

// ---- #402-11A: 固定は stageGen.keepHandwritten に足す。置き換え・複製は gen を外す ----
test('editor-state(面): stageGen のレッスンの固定は keepHandwritten に先頭から連続で足す。途中からは断る', () => {
  const steps = [
    { stepId: 'p1', kind: 'play', ...board() },
    { stepId: 'p2', kind: 'play', ...board({ walls: [{ x: 0, y: 1 }] }), gen: { seed: 1, ver: 1 } },
    { stepId: 'p3', kind: 'play', ...board({ walls: [{ x: 0, y: 2 }] }), gen: { seed: 2, ver: 1 } },
  ];
  const ls = createLessonState('x', steps, ['p1']);
  const skip = pinStep(ls, 2);
  assert.equal(skip.ok, false);
  assert.match(skip.reason, /それより前を全部固定してから/);
  assert.deepEqual(ls.keepHandwritten, ['p1']);
  assert.ok('gen' in ls.steps[2], '断ったら面は変わらない');
  assert.equal(pinStep(ls, 1).ok, true);
  assert.deepEqual(ls.keepHandwritten, ['p1', 'p2']);
  assert.equal(pinStep(ls, 2).ok, true);
  assert.deepEqual(ls.keepHandwritten, ['p1', 'p2', 'p3']);
  assert.ok(ls.steps.every((s) => !('gen' in s)));
  // stageGen の無いレッスン（keepHandwritten なし）は従来どおり gen を捨てるだけ
  const plain = createLessonState('x', lessonSteps());
  assert.equal(plain.keepHandwritten, null);
  assert.equal(pinStep(plain, 2).ok, true);
});

test('editor-state(面): 置き換え・複製は gen を外して手書きの面にする', () => {
  const ls = createLessonState('x', lessonSteps(), []);
  const st = fresh();
  assert.equal(replaceStep(ls, 2, { ...st.spec, gen: { seed: 3, ver: 1 } }).ok, true);
  assert.equal('gen' in ls.steps[2], false);
  const ls2 = createLessonState('x', lessonSteps(), []);
  assert.equal(duplicateStep(ls2, 2).ok, true);
  assert.equal('gen' in ls2.steps[3], false);
  assert.equal('gen' in ls2.steps[2], true, '元の面の gen は残る');
});
