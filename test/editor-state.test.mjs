// #397 段4: 盤面エディタの状態管理（置く・消す・動かす・元に戻す・やり直し、拒否値）。実行: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { occupants, createState, setCellPx, setGrid, place, erase, move, undo, redo, toggleTarget, setSwitchColor, setSwitchMode, setSwitchGroup, setTargetInitial, setMaxPauses, COMPLEX_KEYS, HISTORY_MAX } from '../tools/editor/editor-state.js';
import { SAMPLE_SPEC, EDITOR_MAX_SIZE, pendingSwitches, switchModeOptions, switchGroupOptions, pendingGroupSwitches } from '../tools/editor/editor-view.js';
import { analyzeSpec } from '../tools/editor/validate-worker.mjs';

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
  assert.deepEqual(COMPLEX_KEYS, ['keys', 'paint', 'periodic']); // switches は #404 段A で外した
  for (const key of ['keys', 'paint', 'periodic']) assert.equal(place(s, key, 2, 1).ok, false, key);
  assert.equal(erase(s, 0, 2).ok, false); // かぎ
  assert.equal(move(s, 2, 2, 2, 1).ok, false); // ドア
});

test('editor-state: ワープ（warps1/warps2）は1個ずつ置く・同マスは NG・消す・動かす・空で warps キー削除', () => {
  const s = fresh();
  const free = [];
  for (let y = 0; y < s.spec.grid.rows && free.length < 5; y++) for (let x = 0; x < s.spec.grid.cols && free.length < 5; x++) if (occupants(s.spec, x, y).length === 0) free.push({ x, y });
  assert.ok(free.length >= 5);
  const [a, b, c, d, e] = free;
  assert.equal(s.spec.warps, undefined);
  assert.equal(place(s, 'warps1', a.x, a.y).ok, true);
  assert.deepEqual(s.spec.warps, [{ x: a.x, y: a.y, pair: 1 }]);
  assert.equal(place(s, 'warps2', a.x, a.y).ok, false); // 同マスは NG
  assert.equal(place(s, 'wall', a.x, a.y).ok, false);
  assert.equal(place(s, 'warps1', b.x, b.y).ok, true);
  assert.equal(place(s, 'warps2', c.x, c.y).ok, true);
  assert.equal(place(s, 'warps2', d.x, d.y).ok, true);
  assert.deepEqual(s.spec.warps.map((w) => w.pair), [1, 1, 2, 2]);
  assert.equal(place(s, 'warps1', 99, 99).ok, false); // 盤外
  assert.equal(move(s, c.x, c.y, a.x, a.y).ok, false); // 移動先に要素
  assert.equal(move(s, c.x, c.y, e.x, e.y).ok, true);
  assert.deepEqual(s.spec.warps[2], { x: e.x, y: e.y, pair: 2 }); // pair は保たれる
  assert.equal(erase(s, e.x, e.y).ok, true); // 1個ずつ消える
  assert.equal(s.spec.warps.length, 3);
  for (const w of [a, b, d]) assert.equal(erase(s, w.x, w.y).ok, true);
  assert.equal('warps' in s.spec, false); // 空になったらキーごと消える
  assert.equal(undo(s).ok, true);
  assert.equal(s.spec.warps.length, 1);
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
  assert.deepEqual(s.spec.grid, { cols: 20, rows: 20 });
  assert.equal(EDITOR_MAX_SIZE, 20);
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

// ---- スイッチ（#404 段A）。盤は床だけの 5×1。----
const row = () => createState({ grid: { cols: 5, rows: 1 }, start: { x: 0, y: 0 }, goal: { x: 4, y: 0 }, walls: [] });
const line = (spec) => analyzeSpec({ ...spec, maxCommands: 20 });

test('editor-state: スイッチを置くと接続待ち（targets 空）。validate は落ちる', () => {
  const s = row();
  assert.equal(place(s, 'switches', 1, 0).ok, true);
  assert.deepEqual(s.spec.switches, [{ x: 1, y: 0, color: 'blue', targets: [] }]);
  assert.deepEqual(pendingSwitches(s.spec), [{ index: 0, x: 1, y: 0 }]);
  const r = line(s.spec);
  assert.equal(r.clearable, false);
  assert.ok(r.messages.some((m) => m.includes('targetsが空')));
  assert.equal(place(s, 'switches', 1, 0).ok, false); // 重なり
});

test('editor-state: 壁のタップで targets をトグル（1手ずつ history に入る）。つないだ盤は validate を通る', () => {
  const s = createState({ grid: { cols: 5, rows: 2 }, start: { x: 0, y: 0 }, goal: { x: 4, y: 0 }, walls: [{ x: 2, y: 1 }] }); // (2,0) だけが通り道
  place(s, 'switches', 1, 0);
  const n = s.history.length;
  assert.equal(toggleTarget(s, 1, 0, 2, 0).ok, true);
  assert.equal(s.history.length, n + 1);
  assert.deepEqual(s.spec.switches[0].targets, [{ x: 2, y: 0 }]);
  assert.deepEqual(pendingSwitches(s.spec), []);
  assert.deepEqual(line(s.spec).messages, []);
  assert.equal(toggleTarget(s, 1, 0, 2, 0).ok, true); // もう一度で外す
  assert.deepEqual(s.spec.switches[0].targets, []);
  assert.equal(undo(s).ok, true);
  assert.deepEqual(s.spec.switches[0].targets, [{ x: 2, y: 0 }]);
  assert.equal(toggleTarget(s, 1, 0, 4, 0).ok, false); // ゴールの上
  assert.equal(toggleTarget(s, 1, 0, 1, 0).ok, false); // スイッチ自身
  assert.equal(toggleTarget(s, 3, 1, 3, 0).ok, false); // スイッチが無い
});

test('editor-state: close と open の併用禁止はグレー・拒否。close の盤は validate を通る／併用は落ちる', () => {
  const s = createState({ grid: { cols: 5, rows: 3 }, start: { x: 0, y: 0 }, goal: { x: 4, y: 0 }, walls: [] });
  place(s, 'switches', 1, 0);
  place(s, 'switches', 1, 2); // 選択を外して2つ目
  assert.deepEqual(switchModeOptions(s.spec, 1).map((o) => o.disabled), [false, true, true]); // 相手が open → close・toggle はグレー
  assert.equal(setSwitchMode(s, 1, 2, 'close').ok, false);
  assert.equal(setSwitchMode(s, 1, 0, 'close').ok, false);
  assert.equal(setSwitchMode(s, 1, 2, 'bogus').ok, false);
  // 併用の盤は validate が落とす（正本）
  const both = JSON.parse(JSON.stringify(s.spec));
  both.switches[0].mode = 'close';
  both.switches[0].targets = [{ x: 2, y: 0 }];
  both.switches[1].targets = [{ x: 2, y: 2 }];
  assert.ok(line(both).messages.some((m) => m.includes('併用できない')));
  // 1つだけなら close にできる
  const t = createState({ grid: { cols: 5, rows: 1 }, start: { x: 0, y: 0 }, goal: { x: 4, y: 0 }, walls: [] });
  place(t, 'switches', 1, 0);
  toggleTarget(t, 1, 0, 3, 0);
  assert.equal(setSwitchMode(t, 1, 0, 'close').ok, true);
  assert.equal(t.spec.switches[0].mode, 'close');
  assert.equal(place(t, 'switches', 2, 0).ok, true); // 新しいスイッチは close を引き継ぐ
  assert.equal(t.spec.switches[1].mode, 'close');
  assert.equal(setSwitchMode(t, 1, 0, 'open').ok, false);
  assert.equal(toggleTarget(t, 2, 0, 3, 0).ok, false); // close は対象を共有できない
  assert.equal(setSwitchColor(t, 1, 0, 'red').ok, true);
  assert.equal(t.spec.switches[0].color, 'red');
  assert.equal(setSwitchColor(t, 1, 0, 'green').ok, false);
});

test('editor-state: open 同士は壁を共有できる（最大2）。氷の上にスイッチは置ける', () => {
  const s = createState({ grid: { cols: 5, rows: 2 }, start: { x: 0, y: 0 }, goal: { x: 4, y: 1 }, walls: [], ice: [{ x: 0, y: 1 }] });
  assert.equal(place(s, 'switches', 0, 1).ok, true); // 氷の上
  place(s, 'switches', 1, 1);
  place(s, 'switches', 2, 1);
  assert.equal(toggleTarget(s, 0, 1, 3, 1).ok, true);
  assert.equal(toggleTarget(s, 1, 1, 3, 1).ok, true);
  assert.equal(toggleTarget(s, 2, 1, 3, 1).ok, false); // 3つ目
  assert.equal(erase(s, 3, 1).ok, true); // 壁を消すと持ち主全員から外れる
  assert.deepEqual(s.spec.switches.map((c) => c.targets.length), [0, 0, 0]);
  assert.equal(erase(s, 0, 1).ok, true); // スイッチだけ消え、氷は残る
  assert.deepEqual(s.spec.ice, [{ x: 0, y: 1 }]);
  assert.equal(s.spec.switches.length, 2);
});

test('editor-state: スイッチと対象を動かす／消す', () => {
  const s = row();
  place(s, 'switches', 1, 0);
  toggleTarget(s, 1, 0, 3, 0);
  assert.equal(move(s, 3, 0, 2, 0).ok, true); // 対象の壁
  assert.deepEqual(s.spec.switches[0].targets, [{ x: 2, y: 0 }]);
  assert.equal(move(s, 1, 0, 2, 0).ok, false); // 対象の上
  assert.equal(move(s, 1, 0, 1, 0).ok, false);
  assert.equal(move(s, 1, 0, 3, 0).ok, true);
  assert.deepEqual([s.spec.switches[0].x, s.spec.switches[0].y], [3, 0]);
  assert.equal(erase(s, 3, 0).ok, true);
  assert.equal('switches' in s.spec, false);
});

// ---- #404 段B: group・groupWalls ----
const gboard = () => createState({ grid: { cols: 5, rows: 2 }, start: { x: 0, y: 0 }, goal: { x: 4, y: 0 }, walls: [{ x: 2, y: 1 }] }); // (2,0) だけが通り道

test('editor-state(group): group を付けて壁をトグル。つないだ盤は validate を通り、壁が無い間は落ちる', () => {
  const s = gboard();
  place(s, 'switches', 1, 0);
  assert.equal(setSwitchGroup(s, 1, 0, 'a').ok, true);
  assert.deepEqual(s.spec.switches, [{ x: 1, y: 0, color: 'blue', group: 'a' }]); // targets は持たない
  assert.deepEqual(pendingGroupSwitches(s.spec), [{ index: 0, x: 1, y: 0 }]);
  assert.equal(line(s.spec).clearable, false); // 対応する groupWalls が無い
  const n = s.history.length;
  assert.equal(toggleTarget(s, 1, 0, 2, 0).ok, true);
  assert.equal(s.history.length, n + 1);
  assert.deepEqual(s.spec.groupWalls, [{ x: 2, y: 0, group: 'a' }]);
  assert.deepEqual(pendingGroupSwitches(s.spec), []);
  assert.deepEqual(line(s.spec).messages, []);
  assert.equal(line(s.spec).clearable, true);
  assert.equal(toggleTarget(s, 1, 0, 2, 0).ok, true); // もう一度で外す
  assert.equal('groupWalls' in s.spec, false);
  assert.equal(undo(s).ok, true);
  assert.deepEqual(s.spec.groupWalls, [{ x: 2, y: 0, group: 'a' }]);
  assert.equal(toggleTarget(s, 1, 0, 4, 0).ok, false); // ゴールの上
  assert.equal(toggleTarget(s, 1, 0, 2, 1).ok, false); // 壁の上
});

test('editor-state(group): place(groupWalls)・erase・move と、スイッチを消すと壁も消える', () => {
  const s = gboard();
  assert.equal(place(s, 'groupWalls', 2, 0, 'a').ok, false); // スイッチが無い
  place(s, 'switches', 1, 0);
  setSwitchGroup(s, 1, 0, 'a');
  assert.equal(place(s, 'groupWalls', 2, 0, 'b').ok, false); // b のスイッチが無い
  assert.equal(place(s, 'groupWalls', 2, 0, 'a').ok, true);
  assert.equal(place(s, 'groupWalls', 2, 0, 'a').ok, false); // 重なり
  assert.equal(place(s, 'groupWalls', 3, 0, 'a').ok, true);
  assert.equal(move(s, 3, 0, 2, 0).ok, false); // 移動先に壁
  assert.equal(move(s, 3, 0, 3, 1).ok, true);
  assert.deepEqual(s.spec.groupWalls.map((w) => [w.x, w.y]), [[2, 0], [3, 1]]);
  assert.equal(erase(s, 3, 1).ok, true);
  assert.deepEqual(s.spec.groupWalls, [{ x: 2, y: 0, group: 'a' }]);
  assert.equal(erase(s, 1, 0).ok, true); // スイッチを消すと壁は床に戻る（持ち主がいないと validate が落ちるため）
  assert.equal('groupWalls' in s.spec, false);
  assert.equal('switches' in s.spec, false);
});

test('editor-state(group): 併用禁止（close・toggle・targets・同じ group）は拒否。state は変わらない', () => {
  const s = gboard();
  place(s, 'switches', 1, 0);
  place(s, 'switches', 3, 0);
  assert.equal(setSwitchGroup(s, 1, 0, 'a').ok, true);
  assert.equal(setSwitchGroup(s, 3, 0, 'a').ok, false); // 同じ group は1スイッチだけ
  assert.equal(setSwitchGroup(s, 3, 0, 'bogus').ok, false);
  assert.equal(setSwitchGroup(s, 4, 1, 'b').ok, false); // スイッチが無い
  assert.equal(setSwitchMode(s, 1, 0, 'close').ok, false); // group と close
  const before = snap(s.spec);
  toggleTarget(s, 3, 0, 2, 0); // 3,0 は targets 方式
  assert.equal(setSwitchGroup(s, 3, 0, 'b').ok, false); // targets と group
  assert.equal(setSwitchGroup(s, 3, 0, 'b').reason.includes('targets'), true);
  undo(s);
  assert.deepEqual(s.spec, before);
  const t = gboard();
  place(t, 'switches', 1, 0);
  setSwitchMode(t, 1, 0, 'close');
  assert.equal(setSwitchGroup(t, 1, 0, 'a').ok, false); // close と group
  assert.equal('group' in t.spec.switches[0], false);
  const m = gboard();
  m.spec.switches = [{ x: 1, y: 0, mode: 'toggle', color: 'blue', targets: [] }];
  assert.equal(setSwitchGroup(m, 1, 0, 'a').ok, false);
  // 併用した盤は validate も落ちる
  const bad = snap(s.spec);
  bad.switches[0].mode = 'close';
  bad.groupWalls = [{ x: 2, y: 0, group: 'a' }];
  assert.equal(line(bad).clearable, false);
  assert.ok(line(bad).messages.length > 0);
});

test('editor-state(group): group を変える／なしに戻す。壁が付いていく・床に戻る', () => {
  const s = gboard();
  place(s, 'switches', 1, 0);
  setSwitchGroup(s, 1, 0, 'a');
  toggleTarget(s, 1, 0, 2, 0);
  assert.equal(setSwitchGroup(s, 1, 0, 'b').ok, true);
  assert.deepEqual(s.spec.groupWalls, [{ x: 2, y: 0, group: 'b' }]);
  assert.deepEqual(line(s.spec).messages, []);
  assert.equal(setSwitchGroup(s, 1, 0, '').ok, true);
  assert.equal('groupWalls' in s.spec, false);
  assert.deepEqual(s.spec.switches[0].targets, []);
  assert.deepEqual(pendingSwitches(s.spec), [{ index: 0, x: 1, y: 0 }]);
});

// ---- toggle（#404 段C）----
test('editor-state(toggle): mode を toggle にして壁を複数つなぎ、壁ごとに initial を closed/open にできる', () => {
  const s = row();
  place(s, 'switches', 1, 0);
  assert.equal(setSwitchMode(s, 1, 0, 'toggle').ok, true);
  assert.equal(s.spec.switches[0].mode, 'toggle');
  assert.equal(toggleTarget(s, 1, 0, 2, 0).ok, true);
  assert.equal(toggleTarget(s, 1, 0, 3, 0).ok, true); // 複数壁
  assert.equal(setTargetInitial(s, 1, 0, 3, 0, 'open').ok, true);
  assert.deepEqual(s.spec.switches[0].targets, [{ x: 2, y: 0 }, { x: 3, y: 0, initial: 'open' }]);
  const n = s.history.length;
  assert.equal(setTargetInitial(s, 1, 0, 3, 0, 'closed').ok, true); // closed は既定なので initial を持たない
  assert.equal(s.history.length, n + 1);
  assert.deepEqual(s.spec.switches[0].targets[1], { x: 3, y: 0 });
  assert.equal(setTargetInitial(s, 1, 0, 3, 0, 'bogus').ok, false);
  assert.equal(setTargetInitial(s, 1, 0, 4, 0, 'open').ok, false); // つながっていない壁
  assert.equal(setTargetInitial(s, 3, 0, 3, 0, 'open').ok, false); // スイッチが無い
  setTargetInitial(s, 1, 0, 3, 0, 'open');
  assert.equal(move(s, 3, 0, 3, 0).ok, false);
  assert.equal(setSwitchMode(s, 1, 0, 'open').ok, true); // 単独なら open に戻せる。initial は toggle だけなので消える
  assert.equal(s.spec.switches[0].mode, undefined);
  assert.deepEqual(s.spec.switches[0].targets, [{ x: 2, y: 0 }, { x: 3, y: 0 }]);
  assert.equal(setTargetInitial(s, 1, 0, 3, 0, 'open').ok, false); // toggle でないと initial は付けられない
  undo(s);
  assert.equal(s.spec.switches[0].mode, 'toggle');
});

test('editor-state(toggle): 他の mode との併用は拒否（state は変わらない）。validate も落ちる', () => {
  const s = row();
  place(s, 'switches', 1, 0);
  place(s, 'switches', 3, 0);
  const before = snap(s.spec);
  assert.equal(setSwitchMode(s, 1, 0, 'toggle').ok, false); // 相手が open
  assert.equal(setSwitchMode(s, 1, 0, 'toggle').reason.includes('併用'), true);
  assert.deepEqual(s.spec, before);
  const t = row();
  place(t, 'switches', 1, 0);
  setSwitchMode(t, 1, 0, 'toggle');
  place(t, 'switches', 3, 0); // 2つ目は先のスイッチと同じ mode（toggle）で置く
  assert.equal(t.spec.switches[1].mode, 'toggle');
  assert.equal(setSwitchMode(t, 3, 0, 'close').ok, false); // toggle と close
  assert.equal(setSwitchMode(t, 3, 0, 'open').ok, false);
  assert.equal(toggleTarget(t, 1, 0, 2, 0).ok, true);
  assert.equal(toggleTarget(t, 3, 0, 2, 0).ok, false); // toggle は対象を共有できない
  const bad = snap(t.spec);
  bad.switches[1].mode = 'open';
  const r = line(bad);
  assert.equal(r.clearable, false);
  assert.ok(r.messages.some((m) => m.includes('併用できない')));
  const g = row();
  place(g, 'switches', 1, 0);
  setSwitchGroup(g, 1, 0, 'a');
  assert.equal(setSwitchMode(g, 1, 0, 'toggle').ok, false); // group と toggle
  const h = row();
  place(h, 'switches', 1, 0);
  setSwitchMode(h, 1, 0, 'toggle');
  assert.equal(setSwitchGroup(h, 1, 0, 'a').ok, false);
});

test('editor-state(toggle): 氷・クッションの上には置けない・動かせない・変えられない。validate も落ちる', () => {
  const base = () => createState({ grid: { cols: 5, rows: 1 }, start: { x: 0, y: 0 }, goal: { x: 4, y: 0 }, walls: [], ice: [{ x: 1, y: 0 }], cushion: [{ x: 3, y: 0 }] });
  const s = base();
  assert.equal(place(s, 'switches', 1, 0).ok, true); // open なら氷の上に置ける
  assert.equal(setSwitchMode(s, 1, 0, 'toggle').ok, false); // 氷の上は toggle に変えられない
  assert.equal(setSwitchMode(s, 1, 0, 'toggle').reason.includes('氷'), true);
  const t = base();
  place(t, 'switches', 2, 0);
  assert.equal(setSwitchMode(t, 2, 0, 'toggle').ok, true);
  assert.equal(place(t, 'switches', 1, 0).ok, false); // 2つ目も toggle。氷の上は不可
  assert.equal(place(t, 'switches', 3, 0).ok, false); // クッションの上は不可
  const before = snap(t.spec);
  assert.equal(move(t, 2, 0, 1, 0).ok, false); // toggle を氷の上へ
  assert.equal(move(t, 2, 0, 3, 0).ok, false); // クッションの上へ
  assert.deepEqual(t.spec, before);
  assert.equal(move(t, 2, 0, 2, 0).ok, false); // 動かさない（同じマス）は重なりで拒否のまま
  const bad = snap(t.spec);
  bad.switches[0].x = 1;
  bad.switches[0].targets = [{ x: 2, y: 0 }];
  const r = line(bad);
  assert.equal(r.clearable, false);
  assert.ok(r.messages.some((m) => m.includes('氷の上')));
});

test('editor-state: setMaxPauses は設定・undo/redo でき、0 でキーを消し、負数・小数・非数は拒否する', () => {
  const s = fresh();
  assert.equal(s.spec.maxPauses, undefined);
  assert.equal(setMaxPauses(s, 2).ok, true);
  assert.equal(s.spec.maxPauses, 2);
  assert.equal(setMaxPauses(s, 100).ok, true); // 上限なし
  assert.equal(s.spec.maxPauses, 100);
  assert.equal(undo(s).ok, true);
  assert.equal(s.spec.maxPauses, 2);
  assert.equal(redo(s).ok, true);
  assert.equal(s.spec.maxPauses, 100);
  assert.equal(setMaxPauses(s, 0).ok, true);
  assert.equal('maxPauses' in s.spec, false);
  assert.equal(undo(s).ok, true);
  assert.equal(s.spec.maxPauses, 100);
  const before = snap(s.spec);
  const cursor = s.cursor;
  for (const bad of [-1, 1.5, NaN, Infinity, '2', null, undefined]) {
    assert.equal(setMaxPauses(s, bad).ok, false, String(bad));
  }
  assert.deepEqual(s.spec, before);
  assert.equal(s.cursor, cursor);
  const z = fresh();
  assert.equal(setMaxPauses(z, 0).ok, true); // 既に 0 なら履歴を積まない
  assert.equal(z.cursor, 0);
});
