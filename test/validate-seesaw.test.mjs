// validate-lessons: predict-slider（シーソー）のNG例を検出する(Issue #150)。リポジトリ直下で実行すること。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// 基準は teko-01 の p1〜p3 の複製（本物の teko-01 は面が増えても、このテストの入力は変えない）
const full = JSON.parse(readFileSync('lessons/teko-01-tsuriai.json', 'utf-8'));
const base = { ...full, estimatedMinutes: 5, steps: full.steps.filter((s) => ['s1', 'p1', 'p2', 'p3', 's2'].includes(s.stepId)) };

function validate(mutate) {
  const lesson = JSON.parse(JSON.stringify(base));
  mutate(lesson);
  const dir = mkdtempSync(path.join(tmpdir(), 'vs-'));
  writeFileSync(path.join(dir, `${lesson.lessonId}.json`), JSON.stringify(lesson));
  writeFileSync(
    path.join(dir, 'index.json'),
    JSON.stringify({ units: [{ unitId: 'teko', title: 'つりあい', lessonIds: [lesson.lessonId] }] })
  );
  const r = spawnSync('node', ['tools/validate-lessons.mjs'], { env: { ...process.env, LESSONS_DIR: dir }, encoding: 'utf-8' });
  return { code: r.status, out: r.stdout };
}
const play = (l, id) => l.steps.find((s) => s.stepId === id);

test('validate-lessons: 基準レッスン(teko-01)は検証を通る', () => {
  assert.equal(validate(() => {}).code, 0);
});

const cases = [
  ['つりあう位置がない', '解の個数', (l) => (play(l, 'p1').seesaw.left = [{ robots: 1, pos: 3 }]) && (play(l, 'p1').seesaw.mover.robots = 2)],
  ['startでつりあっている', 'start', (l) => (play(l, 'p1').seesaw.mover.start = 2)],
  ['solutionがずれている', 'solution', (l) => (play(l, 'p1').solution = 3)],
  ['座標が範囲外', 'seesaw', (l) => (play(l, 'p1').seesaw.left[0].pos = 9)],
  ['難易度が減少', '難易度', (l) => (play(l, 'p3').seesaw.left = [{ robots: 1, pos: 1 }]) && (play(l, 'p3').solution = 1)],
  ['playが1個', '盤面の必須', (l) => (l.steps = l.steps.filter((s) => !['p2', 'p3'].includes(s.stepId)))],
];
for (const [label, rule, mutate] of cases) {
  test(`validate-lessons: NG検出: ${label}`, () => {
    const r = validate(mutate);
    assert.equal(r.code === 1 && r.out.includes(rule), true, `NG検出: ${label}\n${r.out}`);
  });
}

// 重さの違うおもり（Issue #612）：設計の8盤（review/design/612/boards/lessons.json）を写し、出る rule と件数を確かめる。
const mp = (stepId, notches, left, mover, solution) => ({ stepId, kind: 'play', seesaw: { notches, left, mover }, solution });
const w1 = { robots: 1, maxRobots: 3, fixedPos: 1, start: 1 };
const board = (plays) => (l) => {
  const s1 = l.steps.find((s) => s.stepId === 's1');
  const s2 = l.steps.find((s) => s.stepId === 's2');
  l.steps = [s1, ...plays, s2];
};
const boards = [
  ['pass-teko-04', [], board([
    mp('p1', 3, [{ robots: 1, pos: 2 }], w1, 2),
    mp('p2', 3, [{ robots: 1, pos: 3 }], w1, 3),
    mp('p3', 3, [{ robots: 2, pos: 2 }], { robots: 1, maxRobots: 3, fixedPos: 2, start: 2 }, 2),
  ])],
  ['pass-teko-05', [], board([
    mp('p1', 2, [{ robots: 1, pos: 2 }], { robots: 1, maxRobots: 3, start: 1 }, [1, 2]),
    mp('p2', 2, [{ robots: 1, pos: 2 }], { robots: 2, maxRobots: 3, start: 2 }, [2, 1]),
    mp('p3', 4, [{ robots: 1, pos: 4 }], { robots: 1, maxRobots: 3, start: 1 }, [2, 2]),
    mp('p4', 3, [{ robots: 2, pos: 3 }], { robots: 1, maxRobots: 3, start: 1 }, [2, 3]),
  ])],
  ['ng-no-solution', ['解の個数:p2', 'solution:p2'], board([
    mp('p1', 3, [{ robots: 1, pos: 2 }], w1, 2),
    mp('p2', 3, [{ robots: 1, pos: 3 }, { robots: 1, pos: 2 }], { robots: 1, maxRobots: 2, fixedPos: 2, start: 2 }, 2),
  ])],
  ['ng-maxRobots-range', ['seesaw:p2'], board([
    mp('p1', 3, [{ robots: 1, pos: 2 }], w1, 2),
    mp('p2', 3, [{ robots: 2, pos: 2 }], { robots: 1, maxRobots: 7, fixedPos: 1, start: 1 }, 4),
  ])],
  ['ng-robots-over-max', ['seesaw:p2'], board([
    mp('p1', 3, [{ robots: 1, pos: 2 }], w1, 2),
    mp('p2', 3, [{ robots: 1, pos: 3 }], { robots: 3, maxRobots: 2, fixedPos: 1, start: 1 }, 3),
  ])],
  ['ng-fixedPos-start-mismatch', ['seesaw:p2'], board([
    mp('p1', 3, [{ robots: 1, pos: 2 }], w1, 2),
    mp('p2', 3, [{ robots: 1, pos: 3 }], { robots: 1, maxRobots: 3, fixedPos: 1, start: 2 }, 3),
  ])],
  ['ng-fixedPos-without-max', ['seesaw:p2'], board([
    mp('p1', 3, [{ robots: 1, pos: 2 }], w1, 2),
    mp('p2', 3, [{ robots: 1, pos: 3 }], { robots: 1, fixedPos: 1, start: 1 }, 3),
  ])],
  ['ng-solution-shape', ['solution:p1'], board([
    mp('p1', 2, [{ robots: 1, pos: 2 }], { robots: 1, maxRobots: 3, start: 1 }, 2),
    mp('p2', 3, [{ robots: 2, pos: 3 }], { robots: 1, maxRobots: 3, start: 1 }, [2, 3]),
  ])],
  // 上限6（Issue #678。review/design/678/boards/678-*.json の形。各盤を p1・p2 に2つ並べる）。期待 OK・NG・OK・NG
  ['678-ok-maxrobots6', [], board([
    mp('p1', 3, [{ robots: 2, pos: 3 }], { robots: 1, maxRobots: 6, fixedPos: 1, start: 1 }, 6),
    mp('p2', 3, [{ robots: 2, pos: 3 }], { robots: 1, maxRobots: 6, fixedPos: 1, start: 1 }, 6),
  ])],
  ['678-ng-maxrobots7', ['seesaw:p1', 'seesaw:p2'], board([
    mp('p1', 3, [{ robots: 2, pos: 3 }], { robots: 1, maxRobots: 7, fixedPos: 1, start: 1 }, 6),
    mp('p2', 3, [{ robots: 2, pos: 3 }], { robots: 1, maxRobots: 7, fixedPos: 1, start: 1 }, 6),
  ])],
  ['678-ok-left6', [], board([
    mp('p1', 3, [{ robots: 6, pos: 1 }], { robots: 2, start: 1 }, 3),
    mp('p2', 3, [{ robots: 6, pos: 1 }], { robots: 2, start: 1 }, 3),
  ])],
  ['678-ng-left7', ['seesaw:p1', 'seesaw:p2'], board([
    mp('p1', 3, [{ robots: 7, pos: 1 }], { robots: 7, start: 2 }, 1),
    mp('p2', 3, [{ robots: 7, pos: 1 }], { robots: 7, start: 2 }, 1),
  ])],
];
for (const [name, expected, mutate] of boards) {
  test(`validate-lessons: 重さの盤 ${name}`, () => {
    const r = validate(mutate);
    const lines = r.out.split('\n');
    // 出力から「rule」と stepId を拾い、期待（rule:stepId の全体）と一致することを確かめる
    const got = [];
    for (const rule of ['解の個数', 'solution', 'seesaw', 'start', '難易度', '盤面の必須']) {
      for (const line of lines) {
        const m = line.includes(rule) && line.match(/stepId="(p\d)"/);
        if (m && line.indexOf(rule) < line.indexOf('stepId=')) got.push(`${rule}:${m[1]}`);
      }
    }
    assert.deepEqual(got.sort(), [...expected].sort(), r.out);
    assert.equal(r.code, expected.length === 0 ? 0 : 1, r.out);
  });
}

// シーソーのれんしゅう（teko-06。Issue #611）：本物の teko-06 を基準に、合格1・不合格（出る rule）を確かめる。
const practice = JSON.parse(readFileSync('lessons/teko-06-practice.json', 'utf-8'));
function validatePractice(mutate) {
  const lesson = JSON.parse(JSON.stringify(practice));
  mutate(lesson);
  const dir = mkdtempSync(path.join(tmpdir(), 'vsp-'));
  writeFileSync(path.join(dir, `${lesson.lessonId}.json`), JSON.stringify(lesson));
  writeFileSync(
    path.join(dir, 'index.json'),
    JSON.stringify({ units: [{ unitId: 'teko', title: 'つりあい', lessonIds: [lesson.lessonId] }], longTrialIds: [lesson.lessonId] })
  );
  const r = spawnSync('node', ['tools/validate-lessons.mjs'], { env: { ...process.env, LESSONS_DIR: dir }, encoding: 'utf-8' });
  return { code: r.status, out: r.stdout };
}
const stageOf = (l, id) => l.steps.find((s) => s.stepId === id);

test('validate-lessons: シーソーのれんしゅう(teko-06)は検証を通る', () => {
  const r = validatePractice(() => {});
  assert.equal(r.code, 0, r.out);
});

const practiceCases = [
  ['段の並びが違う', 'generator', (l) => (stageOf(l, 'p2').generator.seesawStage = 'B')],
  ['未知の段', 'generator', (l) => (stageOf(l, 'p5').generator.seesawStage = 'D')],
  ['generatorに余計なキー', 'generator', (l) => (stageOf(l, 'p1').generator.shape = 'round')],
  ['seesawを書いている', 'generator', (l) => (stageOf(l, 'p1').seesaw = { notches: 3, left: [{ robots: 1, pos: 1 }], mover: { robots: 1, start: 2 } })],
  ['playが7個（8個でない）', 'れんしゅうの構成', (l) => (l.steps = l.steps.filter((s) => s.stepId !== 'p5'))],
];
for (const [label, rule, mutate] of practiceCases) {
  test(`validate-lessons: れんしゅうのNG検出: ${label}`, () => {
    const r = validatePractice(mutate);
    assert.equal(r.code === 1 && r.out.includes(rule), true, `NG検出: ${label}\n${r.out}`);
  });
}

// 右の固定ロボット（right。Issue #689 段1）：review/design/689/boards の right・未知キー・占有の盤を写す。
const rp = (stepId, seesaw, solution) => ({ stepId, kind: 'play', text: 'つりあう ところに おこう', seesaw, solution });
const rightOkSee = { notches: 4, left: [{ robots: 3, pos: 2 }], right: [{ robots: 1, pos: 2 }], mover: { robots: 1, start: 1 } };
const rightOk = (id) => rp(id, JSON.parse(JSON.stringify(rightOkSee)), 4);
const multiSee = { notches: 4, left: [{ robots: 3, pos: 2 }, { robots: 1, pos: 1 }], mover: [{ robots: 1, start: 1 }, { robots: 2, start: 2 }] };
// 2組の面の次に置く、d が大きい単体の面（難易度の非減少を満たす）。
const bigOk = (id) => rp(id, { notches: 6, left: [{ robots: 6, pos: 3 }], mover: { robots: 3, start: 1 } }, 6);
const rightBoards = [
  ['ok-right', [], [rightOk('p1'), rightOk('p2')]],
  ['ng-occupied-solution', ['解の個数:p1', 'solution:p1'], [rp('p1', { ...rightOkSee, mover: { robots: 2, start: 1 } }, 2), rightOk('p2')]],
  ['ng-right-empty', ['seesaw:p1'], [rp('p1', { ...rightOkSee, left: [{ robots: 2, pos: 2 }], right: [] }, 4), rightOk('p2')]],
  ['ng-right-range', ['seesaw:p1'], [rp('p1', { ...rightOkSee, right: [{ robots: 1, pos: 5 }] }, 1), rightOk('p2')]],
  ['ng-right-dup-pos', ['seesaw:p1'], [rp('p1', { ...rightOkSee, right: [{ robots: 1, pos: 2 }, { robots: 1, pos: 2 }] }, 4), rightOk('p2')]],
  ['ng-unknown-key', ['seesaw:p1'], [rp('p1', { notches: 4, left: rightOkSee.left, rights: rightOkSee.right, mover: rightOkSee.mover }, 4), rightOk('p2')]],
  ['ng-unknown-mover-key', ['seesaw:p1'], [rp('p1', { ...rightOkSee, mover: { robots: 1, start: 1, sidee: 'both' } }, 4), rightOk('p2')]],
  ['ng-start-occupied', ['seesaw:p1'], [rp('p1', { ...rightOkSee, mover: { robots: 1, start: 2 } }, 4), rightOk('p2')]],
  [
    'ok-difficulty',
    [],
    [
      rp('p1', { notches: 4, left: [{ robots: 2, pos: 2 }], right: [{ robots: 1, pos: 1 }], mover: { robots: 1, start: 2 } }, 3),
      rightOk('p2'),
    ],
  ],
  [
    'ng-difficulty',
    ['難易度:p2'],
    [
      rightOk('p1'),
      rp('p2', { notches: 4, left: [{ robots: 2, pos: 2 }], right: [{ robots: 1, pos: 1 }], mover: { robots: 1, start: 2 } }, 3),
    ],
  ],
  // side:"both"（段2）：689-ok-right-both・ng-pos0・ng-neg-no-side・ng-side・ok-side
  ['ok-right-both', [], [rp('p1', { ...rightOkSee, mover: { robots: 1, start: -1, side: 'both' } }, 4), rightOk('p2')]],
  ['ok-side', [], [rp('p1', { ...rightOkSee, mover: { robots: 1, start: 1, side: 'right' } }, 4), rightOk('p2')]],
  ['ng-pos0', ['seesaw:p1'], [rp('p1', { notches: 4, left: [{ robots: 2, pos: 2 }], mover: { robots: 1, start: 0, side: 'both' } }, 4), rightOk('p2')]],
  ['ng-neg-no-side', ['seesaw:p1'], [rp('p1', { notches: 4, left: [{ robots: 2, pos: 2 }], mover: { robots: 1, start: -1 } }, 4), rightOk('p2')]],
  ['ng-side', ['seesaw:p1'], [rp('p1', { ...rightOkSee, mover: { robots: 1, start: 1, side: 'left' } }, 4), rightOk('p2')]],
  ['ng-both-start-left-occupied', ['seesaw:p1'], [rp('p1', { ...rightOkSee, mover: { robots: 1, start: -2, side: 'both' } }, 4), rightOk('p2')]],
  // 動かすロボット2組（段3）：689-ok-array-len2・ng-array-len1/3・ng-same-robots/start・ng-array-maxrobots/fixedpos・ok-sets-3・ng-sets-0/4・ng-required
  ['ok-array-len2', [], [rp('p1', multiSee, [3, 2]), bigOk('p2')]],
  ['ok-array-len2-solution-1', [], [rp('p1', multiSee, [1, 3]), bigOk('p2')]],
  ['ng-array-len1', ['seesaw:p1'], [rp('p1', { notches: 4, left: [{ robots: 2, pos: 2 }], mover: [{ robots: 1, start: 1 }] }, [4]), bigOk('p2')]],
  ['ng-array-len3', ['seesaw:p1'], [rp('p1', { ...multiSee, mover: [...multiSee.mover, { robots: 3, start: 3 }] }, [3, 2, 1]), bigOk('p2')]],
  ['ng-same-robots', ['seesaw:p1'], [rp('p1', { notches: 4, left: [{ robots: 4, pos: 2 }], mover: [{ robots: 2, start: 1 }, { robots: 2, start: 2 }] }, [1, 3]), bigOk('p2')]],
  ['ng-same-start', ['seesaw:p1'], [rp('p1', { ...multiSee, mover: [{ robots: 1, start: 1 }, { robots: 2, start: 1 }] }, [3, 2]), bigOk('p2')]],
  ['ng-array-maxrobots', ['seesaw:p1'], [rp('p1', { ...multiSee, mover: [{ robots: 1, start: 1, maxRobots: 4 }, { robots: 2, start: 2 }] }, [3, 2]), bigOk('p2')]],
  ['ng-array-fixedpos', ['seesaw:p1'], [rp('p1', { ...multiSee, mover: [{ robots: 1, start: 1 }, { robots: 2, start: 2, fixedPos: 2 }] }, [3, 2]), bigOk('p2')]],
  ['ok-sets-3', [], [rp('p1', { notches: 6, left: [{ robots: 5, pos: 2 }, { robots: 1, pos: 1 }], mover: multiSee.mover }, [5, 3]), bigOk('p2')]],
  ['ng-sets-0', ['solution:p1', '解の個数:p1'], [rp('p1', { notches: 2, left: multiSee.left, mover: multiSee.mover }, [1, 2]), bigOk('p2')]],
  ['ng-sets-4', ['解の個数:p1'], [rp('p1', { notches: 7, left: [{ robots: 5, pos: 2 }, { robots: 1, pos: 1 }], mover: multiSee.mover }, [5, 3]), bigOk('p2')]],
  ['ng-required', ['必須性:p1'], [rp('p1', { notches: 4, left: [{ robots: 3, pos: 2 }], mover: multiSee.mover }, [4, 1]), bigOk('p2')]],
  ['ng-multi-solution-wrong', ['solution:p1'], [rp('p1', multiSee, [2, 1]), bigOk('p2')]],
];
for (const [name, expected, plays] of rightBoards) {
  test(`validate-lessons: 右固定の盤 ${name}`, () => {
    const r = validate(board(plays));
    const got = [];
    for (const rule of ['解の個数', 'solution', 'seesaw', 'start', '難易度', '盤面の必須', '必須性']) {
      for (const line of r.out.split('\n')) {
        const m = line.includes(rule) && line.match(/stepId="(p\d)"/);
        if (m && line.indexOf(rule) < line.indexOf('stepId=')) got.push(`${rule}:${m[1]}`);
      }
    }
    assert.deepEqual(got.sort(), [...expected].sort(), r.out);
    assert.equal(r.code, expected.length === 0 ? 0 : 1, r.out);
  });
}

// 紹介デモ（intro.demo の kind: "seesaw"。Issue #679）：合格1種・不合格7種。盤は review/design/679/boards の写し。
const seesawDemo = { kind: 'seesaw', seesaw: { notches: 4, left: [{ robots: 1, pos: 3 }], mover: { robots: 1, start: 1 } }, solution: 3 };
const setDemo = (demo) => (l) => (l.steps.find((s) => s.stepId === 's1').demo = demo);
const replaceLesson = (file, demo) => (l) => {
  const other = JSON.parse(readFileSync(file, 'utf-8'));
  other.steps.find((s) => s.kind === 'intro').demo = demo;
  for (const k of Object.keys(l)) delete l[k];
  Object.assign(l, other);
};
const gridDemo = { grid: { cols: 4, rows: 4 }, start: { x: 3, y: 3 }, goal: { x: 0, y: 0 }, walls: [], commands: ['left', 'up'], showCommands: true };
const demoCases = [
  ['pass-1', null, setDemo(seesawDemo)],
  ['fail-1 solutionがつりあわない', 'デモのsolution', setDemo({ ...seesawDemo, solution: 2 })],
  ['fail-2 本番p1と同じ盤', 'デモのネタバレ', setDemo({ ...seesawDemo, seesaw: { ...seesawDemo.seesaw, left: [{ robots: 1, pos: 2 }] }, solution: 2 })],
  ['fail-3 grid形キーの混在', 'デモの形', setDemo({ ...seesawDemo, ...gridDemo })],
  ['fail-4 未知のキー・pos 0・範囲外', 'デモのseesaw', setDemo({ ...seesawDemo, foo: 1, seesaw: { notches: 7, left: [{ robots: 1, pos: 0 }], mover: { robots: 1, start: 1 } } })],
  ['fail-5 buoyancyにdemo', 'デモの形', replaceLesson('lessons/teko-07-ukabu.json', seesawDemo)],
  ['fail-6 grid教材にkind', 'デモの形', replaceLesson('lessons/cmd-01-susumu.json', seesawDemo)],
  ['fail-7 tekoのintroにkindの無いgrid形', 'デモの形', setDemo(gridDemo)],
];
for (const [label, rule, mutate] of demoCases) {
  test(`validate-lessons: 紹介デモ ${label}`, () => {
    const r = validate(mutate);
    if (rule === null) assert.equal(r.code, 0, r.out);
    else assert.equal(r.code === 1 && r.out.includes(rule), true, `${label}\n${r.out}`);
  });
}
