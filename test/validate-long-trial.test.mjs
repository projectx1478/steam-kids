// validate-lessons: 長尺試作（lessons/index.json の longTrialIds）の上限緩和と不合格例(Issue #319)。
// 一覧のIDだけ steps 4〜12・play 2〜8・estimatedMinutes 8 を許す。リポジトリ直下で実行すること（npm run test:unit）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const cmd = JSON.parse(readFileSync('lessons/cmd-01-susumu.json', 'utf-8'));
const teko = JSON.parse(readFileSync('lessons/teko-01-tsuriai.json', 'utf-8'));
const find = (l, id) => l.steps.find((s) => s.stepId === id);

// 空の8x8盤で、右へa・上へbの最短 a+b 手のplay（最短＝マンハッタン距離）。
function gridPlay(i, dist) {
  const a = Math.min(dist, 7);
  const b = dist - a;
  return {
    stepId: `p${i}`,
    kind: 'play',
    grid: { cols: 8, rows: 8 },
    start: { x: 0, y: 7 },
    goal: { x: a, y: 7 - b },
    walls: [],
    allowedCommands: ['up', 'down', 'left', 'right'],
    solution: [...Array(a).fill('right'), ...Array(b).fill('up')],
    maxCommands: dist + 2,
  };
}

// intro＋tutorial＋play群＋summary（summaries個）。steps数＝2＋play数＋summaries。
function gridLesson(id, { dists, summaries = 1, minutes = 8 }) {
  const l = JSON.parse(JSON.stringify(cmd));
  l.lessonId = id;
  l.estimatedMinutes = minutes;
  const sum = find(l, 's2');
  l.steps = [
    find(l, 's1'),
    find(l, 't1'),
    ...dists.map((d, i) => gridPlay(i + 1, d)),
    ...Array.from({ length: summaries }, (_, i) => ({ ...sum, stepId: `s${i + 2}` })),
  ];
  return l;
}

// 解が1つのシーソー盤：左に robots 体を pos 1 に置き、mover 1体の解は robots（難易度＝左のおもさ合計）。
function seesawLesson(id, robotsList, minutes = 8) {
  const l = JSON.parse(JSON.stringify(teko));
  l.lessonId = id;
  l.estimatedMinutes = minutes;
  const plays = robotsList.map((r, i) => ({
    stepId: `p${i + 1}`,
    kind: 'play',
    text: 'つりあう ところに おこう',
    seesaw: { notches: 8, left: [{ robots: r, pos: 1 }], mover: { robots: 1, start: 8 } },
    solution: r,
  }));
  l.steps = [find(l, 's1'), ...plays, find(l, 's2')];
  return l;
}

// lessons: [{ file, data }]。index.jsonは全レッスンを1つのunit（lessonIds）に載せ、longTrialIdsを付ける。
function run(lessons, longTrialIds) {
  const dir = mkdtempSync(path.join(tmpdir(), 'vlt-'));
  for (const { file, data } of lessons) writeFileSync(path.join(dir, `${file}.json`), JSON.stringify(data));
  const index = {
    units: [
      { unitId: 'commands', title: 'めいれい', lessonIds: lessons.filter((x) => x.data.unitId === 'commands').map((x) => x.file) },
      { unitId: 'teko', title: 'つりあい', lessonIds: lessons.filter((x) => x.data.unitId === 'teko').map((x) => x.file) },
    ].filter((u) => u.lessonIds.length > 0),
  };
  if (longTrialIds !== undefined) index.longTrialIds = longTrialIds;
  writeFileSync(path.join(dir, 'index.json'), JSON.stringify(index));
  const r = spawnSync('node', ['tools/validate-lessons.mjs'], { env: { ...process.env, LESSONS_DIR: dir }, encoding: 'utf-8' });
  return { code: r.status, out: r.stdout };
}
const one = (id, data, longTrialIds) => run([{ file: id, data }], longTrialIds);
const ok = (r, label) => assert.equal(r.code, 0, `${label}\n${r.out}`);
const ng = (r, rule, label) => assert.equal(r.code === 1 && r.out.includes(rule), true, `${label}\n${r.out}`);

const DIST8 = [4, 4, 5, 5, 6, 6, 7, 7];

// --- 合格（一覧IDで緩む）---
test('長尺: proto steps 11・play 8・min 8 は合格', () => {
  const l = gridLesson('proto', { dists: DIST8 });
  assert.equal(l.steps.length, 11);
  ok(one('proto', l, ['proto']), 'steps 11');
});
test('長尺: proto steps 12・play 8（境界）は合格', () => {
  const l = gridLesson('proto', { dists: DIST8, summaries: 2 });
  assert.equal(l.steps.length, 12);
  ok(one('proto', l, ['proto']), 'steps 12');
});
test('長尺: proto 8ステージの最短 4,4,5,5,6,6,7,7（非減少）は合格', () => {
  ok(one('proto', gridLesson('proto', { dists: DIST8 }), ['proto']), '非減少');
});
test('長尺: 非空のlongTrialIds（存在するprotoのみ）はindex検査を通る', () => {
  const r = run(
    [
      { file: 'proto', data: gridLesson('proto', { dists: DIST8 }) },
      { file: 'proto2', data: gridLesson('proto2', { dists: [4, 5, 6] }) },
    ],
    ['proto', 'proto2']
  );
  ok(r, 'proto2は一覧IDなのでmin 8のまま合格');
});
test('長尺: longTrialIds省略・空配列でも既存どおり合格（std 5分）', () => {
  const std = gridLesson('std', { dists: [4, 5, 6], minutes: 5 });
  ok(one('std', std, undefined), '省略');
  ok(one('std', std, []), '空配列');
});

// --- 不合格（一覧外・上限超え）---
test('長尺: std（一覧外）は同形(steps 11・play 8・min 8)で不合格', () => {
  const r = one('std', gridLesson('std', { dists: DIST8 }), []);
  ng(r, 'ステップ数', 'std steps 11');
  assert.equal(r.out.includes('盤面の必須'), true, 'std play 8');
  assert.equal(r.out.includes('所要時間'), true, 'std min 8');
});
test('長尺: proto steps 13 は不合格', () => {
  ng(one('proto', gridLesson('proto', { dists: DIST8, summaries: 3 }), ['proto']), 'ステップ数', 'steps 13');
});
test('長尺: proto play 9 は不合格', () => {
  ng(one('proto', gridLesson('proto', { dists: [...DIST8, 7] }), ['proto']), '盤面の必須', 'play 9');
});
test('長尺: proto play 1 は不合格（MIN_PLAYは不変）', () => {
  ng(one('proto', gridLesson('proto', { dists: [4] }), ['proto']), '盤面の必須', 'play 1');
});
test('長尺: proto min 5 は不合格（8ちょうど）', () => {
  ng(one('proto', gridLesson('proto', { dists: DIST8, minutes: 5 }), ['proto']), '所要時間', 'proto min 5');
});
test('長尺: std min 8 は不合格', () => {
  ng(one('std', gridLesson('std', { dists: [4, 5, 6], minutes: 8 }), []), '所要時間', 'std min 8');
});
test('長尺: protoで最短が途中で減ると不合格（難易度の順序）', () => {
  ng(one('proto', gridLesson('proto', { dists: [4, 4, 5, 5, 6, 6, 7, 5] }), ['proto']), '難易度', '最短が減る');
});
test('長尺: 一覧IDの中身を別名ファイルで置いても緩和されない', () => {
  // ファイル名はother、lessonIdはproto。一覧のprotoに対応するproto.jsonは無い。
  const r = one('other', gridLesson('proto', { dists: DIST8 }), ['proto']);
  ng(r, 'ID一致', 'lessonIdとファイル名の不一致');
  assert.equal(r.out.includes('ステップ数'), true, 'ファイル名otherは一覧外なので上限は従来どおり');
  assert.equal(r.out.includes('longTrialIds'), true, 'proto.jsonが無い');
});

// --- 不合格（一覧の入力）---
test('長尺: 一覧にあるのにJSONが無いと不合格', () => {
  ng(one('std', gridLesson('std', { dists: [4, 5, 6], minutes: 5 }), ['ghost']), 'longTrialIds', 'JSONが無い');
});
test('長尺: 一覧IDがseedPickを持つと不合格', () => {
  const practice = JSON.parse(readFileSync('lessons/cmd-06-practice.json', 'utf-8'));
  practice.lessonId = 'practice';
  practice.estimatedMinutes = 8;
  ng(one('practice', practice, ['practice']), '長尺試作とseedPick', 'seedPick併用');
});
test('長尺: longTrialIdsが配列でないと不合格', () => {
  ng(one('std', gridLesson('std', { dists: [4, 5, 6], minutes: 5 }), 'std'), 'longTrialIds', '配列でない');
});
test('長尺: 要素が文字列でないと不合格', () => {
  ng(one('std', gridLesson('std', { dists: [4, 5, 6], minutes: 5 }), [1]), 'longTrialIds', '[1]');
});
test('長尺: 重複は不合格', () => {
  ng(one('proto', gridLesson('proto', { dists: DIST8 }), ['proto', 'proto']), '重複', '["proto","proto"]');
});

// --- seesaw（validateSeesawにも上限が渡る）---
test('長尺: seesaw proto-s play 8 は合格', () => {
  ok(one('proto-s', seesawLesson('proto-s', [1, 1, 2, 2, 3, 3, 4, 4]), ['proto-s']), 'seesaw play 8');
});
test('長尺: seesaw std-s play 5 は不合格', () => {
  ng(one('std-s', seesawLesson('std-s', [1, 1, 2, 2, 3], 5), []), '盤面の必須', 'seesaw std play 5');
});

// --- stageGen の別枠（Issue #369）：一覧に載せず、play≤stageGen.stages・steps≤12・minutes 8 ---
const withGen = (l, stages = 8) => {
  l.stageGen = { ver: 1, stages, keepHandwritten: [], grid: { cols: { min: 3, max: 6 }, rows: { min: 3, max: 6 } }, shortestPath: { min: 2, max: 16 } };
  return l;
};
test('別枠: stageGen あり・一覧外で play 8・steps 11・min 8 は合格', () => {
  ok(one('gen', withGen(gridLesson('gen', { dists: DIST8 })), []), '別枠 play 8');
});
test('別枠: steps 12（境界）は合格・13 は不合格', () => {
  ok(one('gen', withGen(gridLesson('gen', { dists: DIST8, summaries: 2 })), []), 'steps 12');
  ng(one('gen', withGen(gridLesson('gen', { dists: DIST8, summaries: 3 })), []), 'ステップ数', 'steps 13');
});
test('別枠: play 数が stages を超えると不合格（盤面の必須）', () => {
  ng(one('gen', withGen(gridLesson('gen', { dists: DIST8 }), 6), []), '盤面の必須', 'play 8 > stages 6');
});
test('別枠: min 5 は不合格（所要時間）', () => {
  ng(one('gen', withGen(gridLesson('gen', { dists: DIST8, minutes: 5 })), []), '所要時間', 'min 5');
});
test('別枠: stageGen が無ければ一覧外は従来どおり（play 5 は不合格）', () => {
  ng(one('std', gridLesson('std', { dists: [4, 4, 5, 5, 6], minutes: 5 }), []), '盤面の必須', 'stageGen なし play 5');
});
test('別枠: stageGen と longTrialIds の両方でも別枠で見る（play ≤ stages）', () => {
  ok(one('gen', withGen(gridLesson('gen', { dists: DIST8 })), ['gen']), '両方 play 8');
  ng(one('gen', withGen(gridLesson('gen', { dists: DIST8 }), 6), ['gen']), '盤面の必須', '両方 play 8 > stages 6');
});
test('別枠: seedPick を持つ stageGen は別枠にならず stageGen で不合格（min 5 のまま）', () => {
  const practice = JSON.parse(readFileSync('lessons/cmd-06-practice.json', 'utf-8'));
  practice.lessonId = 'practice';
  const r = one('practice', withGen(practice, 2), []);
  ng(r, 'stageGen', 'seedPick+stageGen');
  assert.equal(r.out.includes('所要時間'), false, 'seedPick には別枠を適用しない');
});
