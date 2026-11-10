// validate-lessons: predict-slider（うかぶ・しずむ。play.buoyancy）の合否（Issue #288・#710）。
// test/fixtures/buoyancy/710-ok.json を一時ディレクトリに置いて tools/validate-lessons.mjs にかける。NGの面は ok を書き換えて作る。リポジトリ直下で実行すること。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const OK = JSON.parse(readFileSync('test/fixtures/buoyancy/710-ok.json', 'utf-8'));

function validate(lesson) {
  const dir = mkdtempSync(path.join(tmpdir(), 'vb-'));
  writeFileSync(path.join(dir, `${lesson.lessonId}.json`), JSON.stringify(lesson));
  writeFileSync(
    path.join(dir, 'index.json'),
    JSON.stringify({ units: [{ unitId: 'teko', title: 'つりあい', lessonIds: [lesson.lessonId] }] })
  );
  const r = spawnSync('node', ['tools/validate-lessons.mjs'], { env: { ...process.env, LESSONS_DIR: dir }, encoding: 'utf-8' });
  return { code: r.status, out: r.stdout };
}

// ok を複製し、play の p3（4道具・点なし）を mutate で書き換える。
function variant(mutate) {
  const lesson = structuredClone(OK);
  mutate(lesson, lesson.steps.find((s) => s.stepId === 'p3'));
  return lesson;
}

test('validate-buoyancy: 710-ok は合格', () => {
  const r = validate(OK);
  assert.equal(r.code, 0, r.out);
});

// [名前, 出るはずの規則名, 書き換え]
const ngCases = [
  ['旧キー base', 'buoyancy', (l, p) => { p.buoyancy = { base: 2, weights: { start: 1, max: 3 } }; }],
  ['旧キー weights を併記', 'buoyancy', (l, p) => { p.buoyancy.weights = { start: 1, max: 3 }; }],
  ['未知キー', 'buoyancy', (l, p) => { p.buoyancy.foo = 1; }],
  ['ring が3', 'buoyancy', (l, p) => { p.buoyancy.bodies[0].ring = 3; }],
  ['box.v が7', 'buoyancy', (l, p) => { p.buoyancy.bodies[0].box.v = 7; }],
  ['box.v が小数', 'buoyancy', (l, p) => { p.buoyancy.bodies[0].box.v = 1.5; }],
  ['tools の重複', 'buoyancy', (l, p) => { p.buoyancy.tools = ['w2', 'w2', 'b3']; }],
  ['tools が5個', 'buoyancy', (l, p) => { p.buoyancy.tools = ['w1', 'w2', 'w3', 'b1', 'b2']; }],
  ['tools が1個', 'buoyancy', (l, p) => { p.buoyancy.tools = ['w2']; }],
  ['tools の未知 id', 'buoyancy', (l, p) => { p.buoyancy.tools = ['w2', 'w4']; }],
  ['bodies が空', 'buoyancy', (l, p) => { p.buoyancy.bodies = []; }],
  ['dots が真偽値でない', 'buoyancy', (l, p) => { p.buoyancy.dots = 'yes'; }],
  ['つりあう組が2個（find 無し）', '解の個数', (l, p) => {
    p.buoyancy = { bodies: [{ ring: 4 }], tools: ['w1', 'w2', 'w3', 'b1'] };
    p.solution = ['w1', 'w3'];
  }],
  ['つりあう組が0個', '解の個数', (l, p) => { p.buoyancy = { bodies: [{ ring: 6 }], tools: ['b1', 'b2'] }; }],
  ['solution が無い', 'solution', (l, p) => { delete p.solution; }],
  ['solution が組の外', 'solution', (l, p) => { p.solution = ['w3', 'b2']; }],
  ['solution が文字列', 'solution', (l, p) => { p.solution = 'w2'; }],
  ['solution が tools に無い id', 'solution', (l, p) => { p.solution = ['w1']; }],
  ['何も付けない時点でつりあう', 'start', (l, p) => { p.buoyancy.bodies[0].box.v = 2; }],
  ['点なしで期待試行が低い', '当てずっぽう', (l, p) => { p.buoyancy = { bodies: [{ ring: 2 }], tools: ['w1', 'w2'] }; p.solution = ['w2']; }],
  ['難易度が下がる', '難易度', (l) => { l.steps = [l.steps[0], l.steps[3], l.steps[2], l.steps[1], l.steps[4], l.steps[5]]; }],
  ['2体：bodies が3体', 'buoyancy', (l) => { const p5 = l.steps.find((s) => s.stepId === 'p5'); p5.buoyancy.bodies.push({ ring: 2 }); }],
  ['2体：hidden と併用', 'buoyancy', (l) => { const p5 = l.steps.find((s) => s.stepId === 'p5'); p5.buoyancy.bodies[0].box = { v: 1, hidden: true }; }],
  ['2体：find:2', 'buoyancy', (l) => { const p5 = l.steps.find((s) => s.stepId === 'p5'); p5.buoyancy.find = 2; }],
  ['2体：solution が id の配列', 'solution', (l) => { const p5 = l.steps.find((s) => s.stepId === 'p5'); p5.solution = ['w2', 'w1', 'w3']; }],
  ['2体：solution が左右逆', 'solution', (l) => { const p5 = l.steps.find((s) => s.stepId === 'p5'); p5.solution = [{ tool: 'w2', body: 1 }, { tool: 'w1', body: 0 }, { tool: 'w3', body: 0 }]; }],
  ['2体：つりあう組が0個', '解の個数', (l) => { const p5 = l.steps.find((s) => s.stepId === 'p5'); p5.buoyancy.bodies = [{ ring: 2 }, { ring: 2 }]; }],
  ['find が3', 'buoyancy', (l, p) => { p.buoyancy.find = 3; }],
  ['find:2 なのにつりあう組が1個', '解の個数', (l, p) => { p.buoyancy.find = 2; }],
  ['find:2 の solution が片方だけ', 'solution', (l) => { const p4 = l.steps.find((s) => s.stepId === 'p4'); p4.solution = [['w1', 'w3']]; }],
  ['find:2 の solution が配列の配列でない', 'solution', (l) => { const p4 = l.steps.find((s) => s.stepId === 'p4'); p4.solution = ['w1', 'w3']; }],
  ['find 無しで solution が配列の配列', 'solution', (l, p) => { p.solution = [['w2', 'b3']]; }],
  ['seesaw と混在', 'seesawとbuoyancyの混在', (l) => {
    const p1 = l.steps.find((s) => s.stepId === 'p1');
    delete p1.buoyancy;
    p1.seesaw = { notches: 4, left: [{ robots: 1, pos: 2 }], mover: { robots: 1, start: 4 } };
    p1.solution = 2;
  }],
];
for (const [name, rule, mutate] of ngCases) {
  test(`validate-buoyancy: ${name} は不合格（${rule}）`, () => {
    const r = validate(variant(mutate));
    assert.equal(r.code === 1 && r.out.includes(`: ${rule}: `), true, `${name}\n${r.out}`);
  });
}
