// #662: 面とチュートリアルの編集（editor-state.test.mjs から分割）。実行: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState, place, move, undo, addTutorialStep, setStepText, setTutorialScript, tutorialReach } from '../tools/editor/editor-state.js';
import { SAMPLE_SPEC } from '../tools/editor/editor-view.js';
import { createLessonState, selectStep, loadSpec, moveStep, replaceStep, removeStep, duplicateStep, pinStep, duplicateBoards } from '../tools/editor/editor-state.js';

const fresh = () => createState(SAMPLE_SPEC);
const snap = (v) => JSON.parse(JSON.stringify(v));

// ---- #402 段2: レッスンの面の一覧・並べ替え・固定 ----

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

test('editor-state(tutorial): 足す＝intro の直後・allowedCommands を引き継ぎ・script は [run]・solution 等は落とす', () => {
  const play = { stepId: 'p1', kind: 'play', text: 'どこ？', grid: { cols: 3, rows: 3 }, start: { x: 0, y: 0 }, goal: { x: 2, y: 0 }, allowedCommands: ['right', 'down'], solution: ['right', 'right'], maxCommands: 3, gen: { a: 1 } };
  const ls = createLessonState('x', [{ stepId: 's1', kind: 'intro', text: 'a' }, play, { stepId: 's2', kind: 'summary', text: 'b' }]);
  const r = addTutorialStep(ls, play);
  assert.equal(r.ok, true);
  assert.deepEqual(ls.steps.map((x) => x.kind), ['intro', 'tutorial', 'play', 'summary']);
  const t = ls.steps[1];
  assert.deepEqual(t.allowedCommands, ['right', 'down']);
  assert.deepEqual(t.script, [{ tap: 'run' }]);
  assert.equal(t.stepId, 'tutorial');
  for (const k of ['solution', 'maxCommands', 'gen', 'text']) assert.equal(k in t, false, k);
  assert.equal(ls.selected, 1);
  assert.equal(play.solution.length, 2, '元の spec は変えない');
  // 二重に足さない
  assert.equal(addTutorialStep(ls, play).ok, false);
  assert.equal(ls.steps.length, 4);
  // 消す（既存の removeStep）
  assert.equal(removeStep(ls, 1).ok, true);
  assert.equal(ls.steps.some((x) => x.kind === 'tutorial'), false);
});

test('editor-state(tutorial): intro が無い・最初の play より後の intro・盤面が無いときは拒否', () => {
  const play = { stepId: 'p1', kind: 'play', grid: { cols: 2, rows: 1 }, start: { x: 0, y: 0 }, goal: { x: 1, y: 0 } };
  assert.equal(addTutorialStep(createLessonState('x', [play]), play).ok, false);
  assert.equal(addTutorialStep(createLessonState('x', [play, { stepId: 's1', kind: 'intro' }]), play).ok, false);
  assert.equal(addTutorialStep(createLessonState('x', [{ stepId: 's1', kind: 'intro' }, play]), { stepId: 'z' }).ok, false);
});

test('editor-state(tutorial): setStepText は文字列のみ。空は text を消す。元に戻せる', () => {
  const s = fresh();
  assert.equal(setStepText(s, 3).ok, false);
  assert.equal(setStepText(s, 'ここを おす').ok, true);
  assert.equal(s.spec.text, 'ここを おす');
  assert.equal(setStepText(s, '').ok, true);
  assert.equal('text' in s.spec, false);
  undo(s);
  assert.equal(s.spec.text, 'ここを おす');
});

test('editor-state(tutorial): setTutorialScript は末尾に run を足して入れる。run は捨てる・範囲外の命令は拒否・元に戻せる', () => {
  const play = { stepId: 'p1', kind: 'play', grid: { cols: 3, rows: 1 }, start: { x: 0, y: 0 }, goal: { x: 2, y: 0 }, allowedCommands: ['right', 'down'] };
  const ls = createLessonState('x', [{ stepId: 's1', kind: 'intro' }, play]);
  assert.equal(addTutorialStep(ls, play).ok, true);
  const s = createState(ls.steps[ls.selected]);
  assert.equal(setTutorialScript(s, [{ tap: 'right' }, { tap: 'run' }, { tap: 'right' }]).ok, true);
  assert.deepEqual(s.spec.script, [{ tap: 'right' }, { tap: 'right' }, { tap: 'run' }]);
  assert.equal(setTutorialScript(s, [{ tap: 'up' }]).ok, false, 'allowedCommands の範囲外');
  assert.equal(setTutorialScript(s, 'right').ok, false);
  assert.deepEqual(s.spec.script.length, 3, '拒否時は変えない');
  assert.equal(setTutorialScript(s, []).ok, true);
  assert.deepEqual(s.spec.script, [{ tap: 'run' }]);
  undo(s);
  assert.equal(s.spec.script.length, 3);
  assert.equal(setTutorialScript(fresh(), [{ tap: 'right' }]).ok, false, 'tutorial の面ではない');
});

test('editor-state(tutorial): tutorialReach はゴールに着く手順だけ true。方向以外の tap は null', () => {
  const t = { stepId: 't', kind: 'tutorial', grid: { cols: 3, rows: 1 }, start: { x: 0, y: 0 }, goal: { x: 2, y: 0 }, allowedCommands: ['right'] };
  assert.equal(tutorialReach({ ...t, script: [{ tap: 'right' }, { tap: 'right' }, { tap: 'run' }] }), true);
  assert.equal(tutorialReach({ ...t, script: [{ tap: 'right' }, { tap: 'run' }] }), false);
  assert.equal(tutorialReach({ ...t, script: [{ tap: 'run' }] }), false);
  assert.equal(tutorialReach({ ...t, script: [{ tap: 'remove', index: 0 }, { tap: 'run' }] }), null);
  assert.equal(tutorialReach({ stepId: 'z' }), null);
});
