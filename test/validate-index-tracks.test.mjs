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
for (const [label, rule, mutate] of cases) {
  test(label, () => {
    const p = boardP();
    mutate(p);
    const r = validate(p);
    assert.equal(r.code, 1, r.out);
    assert.deepEqual(rulesOf(r.out), [rule], r.out);
  });
}
