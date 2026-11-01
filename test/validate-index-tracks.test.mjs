// validate-lessons: index.json の tracks 対応（Issue #374）。リポジトリ直下で実行すること（npm run test:unit）。
// 本番 lessons/*.json を一時ディレクトリへコピーし、index.json だけ差し替えて流す。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const legacy = JSON.parse(readFileSync('lessons/index.json', 'utf-8'));
// 現行 index を旧形（units 直下）に戻す（tracks 形でも旧形でも同じ盤になる）。
const legacyUnits = legacy.units ?? legacy.tracks.flatMap((t) => t.units);
const { longTrialIds } = legacy;
const clone = (x) => JSON.parse(JSON.stringify(x));
const legacyIndex = () => ({ longTrialIds: clone(longTrialIds), units: clone(legacyUnits) });
const boardP = () => ({
  longTrialIds: clone(longTrialIds),
  tracks: [{ trackId: 'robot', title: 'ロボットを うごかす', units: clone(legacyUnits) }],
});

function validate(index) {
  const dir = mkdtempSync(path.join(tmpdir(), 'vit-'));
  for (const f of readdirSync('lessons')) {
    if (f.endsWith('.json') && f !== 'index.json') copyFileSync(path.join('lessons', f), path.join(dir, f));
  }
  writeFileSync(path.join(dir, 'index.json'), JSON.stringify(index));
  const r = spawnSync('node', ['tools/validate-lessons.mjs'], { env: { ...process.env, LESSONS_DIR: dir }, encoding: 'utf-8' });
  return { code: r.status, out: r.stdout };
}

// 出力に出た規則名（`index.json: <規則名>: …` の行）の集合。
const rulesOf = (out) => [...new Set(out.split('\n').filter((l) => l.startsWith('index.json: ')).map((l) => l.split(': ')[1]))];

test('P: 全 units を1つの track にした盤は OK', () => {
  const r = validate(boardP());
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /^OK: /m);
});

test('P2: 旧形（units 直下のみ）は OK', () => {
  const r = validate(legacyIndex());
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /^OK: /m);
});

const cases = [
  [
    'F1: ice-01-suberu を lessonIds から外す→掲載漏れ',
    '掲載漏れ',
    (p) => {
      const ice = p.tracks[0].units.find((u) => u.unitId === 'ice');
      ice.lessonIds = ice.lessonIds.filter((id) => id !== 'ice-01-suberu');
    },
  ],
  ['F2: 直下の units も足す→tracksとunitsの併用', 'tracksとunitsの併用', (p) => (p.units = clone(legacyUnits))],
  ['F3: tracks をオブジェクトにする→tracksの型', 'tracksの型', (p) => (p.tracks = { trackId: 'robot' })],
  [
    'F4: 2つの track の trackId を両方 robot→trackIdの重複',
    'trackIdの重複',
    (p) => {
      const [first, ...rest] = p.tracks[0].units;
      p.tracks = [
        { trackId: 'robot', title: 'a', units: [first] },
        { trackId: 'robot', title: 'b', units: rest },
      ];
    },
  ],
  [
    'F5: units が空の track を足す→unitsが空',
    'unitsが空',
    (p) => p.tracks.push({ trackId: 'empty', title: 'から', units: [] }),
  ],
];
// 単元の icon・color（Issue #644）。未知の値・文字列でない値は拒否、省略と許可値は合格。
const unitOf = (p, id) => p.tracks[0].units.find((u) => u.unitId === id);
cases.push(
  ['I1: 未知の icon "star"→unitのicon', 'unitのicon', (p) => (unitOf(p, 'commands').icon = 'star')],
  ['I2: icon が空文字→unitのicon', 'unitのicon', (p) => (unitOf(p, 'commands').icon = '')],
  ['I3: icon が null→unitのicon', 'unitのicon', (p) => (unitOf(p, 'commands').icon = null)],
  ['I4: icon が数→unitのicon', 'unitのicon', (p) => (unitOf(p, 'commands').icon = 3)],
  ['C1: 未知の color "red"→unitのcolor', 'unitのcolor', (p) => (unitOf(p, 'commands').color = 'red')],
  ['C2: color "bg-emerald-400"→unitのcolor', 'unitのcolor', (p) => (unitOf(p, 'commands').color = 'bg-emerald-400')],
  ['C3: color が空文字→unitのcolor', 'unitのcolor', (p) => (unitOf(p, 'commands').color = '')],
  ['C4: color が null→unitのcolor', 'unitのcolor', (p) => (unitOf(p, 'commands').color = null)],
  ['C5: color が配列→unitのcolor', 'unitのcolor', (p) => (unitOf(p, 'commands').color = ['amber'])]
);

// 大項目の intro（Issue #644 段2）。demo は intro.demo と同形、text は短い文字列。
const goodDemo = () => ({
  grid: { cols: 3, rows: 1 },
  start: { x: 0, y: 0 },
  goal: { x: 2, y: 0 },
  walls: [],
  commands: ['right', 'right'],
});
cases.push(
  ['T1: intro.text が数→tracksのintro', 'tracksのintro', (p) => (p.tracks[0].intro = { demo: goodDemo(), text: 3 })],
  [
    'T2: intro.demo に grid が無い→tracksのintro',
    'tracksのintro',
    (p) => {
      const demo = goodDemo();
      delete demo.grid;
      p.tracks[0].intro = { demo, text: 'ゴールまで すすもう' };
    },
  ],
  ['T3: intro が配列→tracksのintro', 'tracksのintro', (p) => (p.tracks[0].intro = [])],
  ['T4: intro.demo が無い→tracksのintro', 'tracksのintro', (p) => (p.tracks[0].intro = { text: 'あ' })],
  [
    'T5: intro.demo の commands が壁にぶつかる→tracksのintro',
    'tracksのintro',
    (p) => {
      const demo = goodDemo();
      demo.walls = [{ x: 1, y: 0 }];
      p.tracks[0].intro = { demo, text: 'あ' };
    },
  ],
  ['T6: intro.text が長すぎる→tracksのintro', 'tracksのintro', (p) => (p.tracks[0].intro = { demo: goodDemo(), text: 'あ'.repeat(61) })]
);

const okCases = [
  ['T7: intro（demo + text）は OK', (p) => (p.tracks[0].intro = { demo: goodDemo(), text: 'ゴールまで すすもう' })],
  ['T8: intro.text 空文字は OK（文を出さない）', (p) => (p.tracks[0].intro = { demo: goodDemo(), text: '' })],
  ['T9: intro.text 省略は OK', (p) => (p.tracks[0].intro = { demo: goodDemo() })],
  ['I5: icon・color 全省略は OK', () => {}],
  ['I6: icon "none" は OK', (p) => (unitOf(p, 'ice').icon = 'none')],
  [
    'I7: icon + color 指定は OK',
    (p) => {
      unitOf(p, 'commands').icon = 'donguri';
      unitOf(p, 'commands').color = 'amber';
    },
  ],
  [
    'I8: 許可する icon 7種・color 6色すべて OK',
    (p) => {
      const icons = ['commands', 'donguri', 'ice', 'keys', 'switches', 'teko', 'none'];
      const colors = ['emerald', 'amber', 'sky', 'purple', 'rose', 'teal'];
      p.tracks[0].units.forEach((u, i) => {
        u.icon = icons[i % icons.length];
        u.color = colors[i % colors.length];
      });
    },
  ],
];
for (const [label, mutate] of okCases) {
  test(label, () => {
    const p = boardP();
    mutate(p);
    const r = validate(p);
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /^OK: /m);
  });
}

for (const [label, rule, mutate] of cases) {
  test(label, () => {
    const p = boardP();
    mutate(p);
    const r = validate(p);
    assert.equal(r.code, 1, r.out);
    assert.deepEqual(rulesOf(r.out), [rule], r.out);
  });
}
