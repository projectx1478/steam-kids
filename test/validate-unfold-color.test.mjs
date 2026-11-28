// unfold-cube 色ぬり（play.unfoldColor）の検証の合否（Issue #811 段B1）。合格の土台は test/fixtures/unfold/color-lesson-ok.json。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateUnfoldColorFace, validateUnfoldColor, checkUnfoldColorDemo } from '../tools/lib/validate/unfold.mjs';
import { validateLesson } from '../tools/validate-lessons.mjs';

const base = JSON.parse(readFileSync('test/fixtures/unfold/color-lesson-ok.json', 'utf-8'));
const fresh = () => structuredClone(base);
const cs = (...p) => p.map(([x, y, c]) => (c ? { x, y, c } : { x, y }));

// レッスン全体の検査名の一覧（isLong 既定 true）。
function lessonRules(mutate, isLong = true) {
  const b = fresh();
  mutate?.(b);
  const errs = [];
  validateUnfoldColor(b.plays, b.intro, (rule, detail) => errs.push({ rule, detail }), isLong);
  return errs.map((e) => e.rule);
}
// 1面の検査名と戻り値（面は p3＝6マスの十字を土台に差し替える）。
function faceRules(mutate, idx = 2) {
  const p = fresh().plays[idx];
  mutate?.(p.unfoldColor);
  const errs = [];
  const info = validateUnfoldColorFace(p, (rule, detail) => errs.push({ rule, detail }), 'p ');
  return { rules: errs.map((e) => e.rule), info };
}

test('color-lesson-ok.json は合格（空きは 2,2,3,3,3,3,4,4・正解は 1,1,1,1,1,1,3,3・型は全部別）', () => {
  assert.deepEqual(lessonRules(), []);
  const infos = base.plays.map((p) => validateUnfoldColorFace(p, () => assert.fail('面が不合格'), ''));
  assert.deepEqual(infos.map((i) => i.blanks), [2, 2, 3, 3, 3, 3, 4, 4]);
  assert.deepEqual(infos.map((i) => i.solutions), [1, 1, 1, 1, 1, 1, 3, 3]);
  assert.deepEqual(infos.map((i) => i.n), [5, 5, 6, 6, 6, 6, 6, 6]);
  assert.equal(infos[0].shape, '1,0|0,1|1,1|2,1|1,2');
  assert.equal(infos[1].shape, '0,0|0,1|1,1|2,1|0,2');
  assert.equal(new Set(infos.map((i) => i.shape)).size, 8);
});

test('面ごと：各検査名で不合格になる例（検査名で判定）', () => {
  const cases = [
    ['unfoldColorの形', (u) => { u.net = 'x'; }],
    ['unfoldColorの形', (u) => { u.given = [{ x: 1 }]; }],
    ['格子の大きさ', (u) => { u.cols = 4; }],
    ['netが格子外', (u) => { u.net[5] = { x: 1, y: 3 }; }],
    ['netの重複', (u) => { u.net[5] = { ...u.net[4] }; }],
    ['netの枚数', (u) => { u.net.push({ x: 4, y: 1 }); }],
    ['netが展開図でない', (u) => { u.net = cs([0, 0], [1, 0], [0, 1], [1, 1], [2, 1], [3, 1]); u.given = cs([0, 0, 'a'], [3, 1, 'b']); }],
    ['netが展開図でない', (u) => { u.net = cs([0, 0], [1, 0], [2, 0], [3, 0], [4, 0]); u.given = cs([0, 0, 'a'], [1, 0, 'b']); }],
    ['givenの形', (u) => { u.given = []; }],
    ['givenの形', (u) => { u.given[0].c = 'z'; }],
    ['givenの形', (u) => { u.given[1] = { ...u.given[0], c: 'b' }; }],
    ['givenの形', (u) => { u.given[0] = { x: 4, y: 2, c: 'a' }; }],
    ['givenの色の重複', (u) => { u.given[1].c = 'a'; }],
    ['givenが向かい合う', (u) => { u.given = cs([1, 0, 'a'], [1, 2, 'b']); }],
    ['空きの枚数', (u) => { u.given.push({ x: 3, y: 1, c: 'c' }); }, 0],
    ['ひと色で解ける', (u) => { u.given = cs([1, 0, 'a']); }],
  ];
  for (const [rule, mutate, idx] of cases) {
    const { rules, info } = faceRules(mutate, idx);
    assert.ok(rules.includes(rule), `${rule}: ${rules.join(',')}`);
    if (['unfoldColorの形', 'netの枚数', 'givenの形'].includes(rule)) assert.equal(info, null, rule);
  }
});

test('面ごと：givenがそこ（5マスの面で「そこ」に色）／5マスの給水の空き', () => {
  const r = faceRules((u) => { u.given.push({ x: 2, y: 1, c: 'c' }); }, 0);
  assert.ok(r.rules.includes('givenがそこ'), r.rules.join(','));
  const ok = faceRules(null, 0);
  assert.deepEqual(ok.rules, []);
  assert.equal(ok.info.blanks, 2);
});

test('面ごと：その1行だけで落ちる例（代表）', () => {
  assert.deepEqual(faceRules((u) => { u.cols = 4; }).rules, ['格子の大きさ']);
  assert.deepEqual(faceRules((u) => { u.given = cs([1, 0, 'a']); }).rules, ['ひと色で解ける']);
  assert.deepEqual(faceRules((u) => { u.given[1].c = 'a'; }).rules, ['givenの色の重複']);
  assert.deepEqual(faceRules((u) => { u.given = cs([1, 0, 'a'], [1, 2, 'b']); }).rules, ['givenが向かい合う']);
  assert.deepEqual(faceRules((u) => { u.given.push({ x: 2, y: 1, c: 'c' }); }, 0).rules, ['givenがそこ']);
});

test('レッスン全体：各検査名で不合格になる例', () => {
  const swap = (b, i, j) => { [b.plays[i], b.plays[j]] = [b.plays[j], b.plays[i]]; };
  const cases = [
    ['長尺試作', null, false],
    ['盤面の必須', (b) => { b.plays.pop(); }],
    ['面の枚数の並び', (b) => swap(b, 0, 2)],
    ['面の枚数の並び', (b) => { b.plays[7].unfoldColor.net = fresh().plays[0].unfoldColor.net; b.plays[7].unfoldColor.given = fresh().plays[0].unfoldColor.given; }],
    ['難易度の順序', (b) => swap(b, 5, 6)],
    ['型の重複', (b) => {
      const n4 = b.plays[3].unfoldColor.net;
      b.plays[4].unfoldColor.net = n4; b.plays[4].unfoldColor.given = cs([0, 0, 'a'], [0, 1, 'b'], [1, 1, 'c']);
      b.plays[5].unfoldColor.net = n4; b.plays[5].unfoldColor.given = cs([0, 0, 'c'], [0, 1, 'a'], [1, 1, 'b']);
    }],
    ['面の重複', (b) => { b.plays[5].unfoldColor = structuredClone(b.plays[4].unfoldColor); }],
    ['デモの形', (b) => { delete b.intro.demo; }],
    ['デモの形', (b) => { b.intro.demo.kind = 'paint'; }],
    ['デモの形', (b) => { b.intro.demo.net[1].c = 'a'; }],
    ['デモの形', (b) => { b.intro.demo.net[0].c = 'z'; }],
    ['デモの形', (b) => { b.intro.demo.net.forEach((c) => { if (c.c === 'c') c.c = 'b'; }); }],
    ['デモの形', (b) => { b.intro.demo.net[5] = { x: 1, y: 0, c: 'a' }; b.intro.demo.net[0] = { x: 0, y: 0, c: 'a' }; }],
    ['デモが本番と同じ盤', (b) => {
      b.intro.demo.net = cs([1, 0, 'a'], [0, 1, 'c'], [1, 1, 'b'], [2, 1, 'c'], [3, 1, 'b'], [1, 2, 'a']);
    }],
  ];
  for (const [rule, mutate, isLong] of cases) {
    const rules = lessonRules(mutate, isLong ?? true);
    assert.ok(rules.includes(rule), `${rule}: ${rules.join(',')}`);
  }
});

test('レッスン全体：その1行だけで落ちる例（代表）', () => {
  assert.deepEqual(lessonRules(null, false), ['長尺試作']);
  assert.deepEqual(lessonRules((b) => { b.plays[5].unfoldColor = structuredClone(b.plays[4].unfoldColor); }), ['面の重複']);
  assert.deepEqual(lessonRules((b) => { [b.plays[5], b.plays[6]] = [b.plays[6], b.plays[5]]; }), ['難易度の順序']);
  assert.deepEqual(lessonRules((b) => { b.intro.demo.kind = 'paint'; }), ['デモの形']);
});

test('checkUnfoldColorDemo 単体：demo 無しは不合格、本番どおりの色つき6マスは合格', () => {
  const errs = [];
  checkUnfoldColorDemo(undefined, base.plays, (r) => errs.push(r));
  assert.deepEqual(errs, ['デモの形']);
  const ok = [];
  checkUnfoldColorDemo(base.intro.demo, base.plays, (r) => ok.push(r));
  assert.deepEqual(ok, []);
});

// --- validateLesson の分岐（unfold と unfoldColor の混在） ---
const lessonOf = (plays, intro) => ({
  lessonId: 'unfold-color-test', unitId: 'u', title: 'あ', type: 'unfold-cube', estimatedMinutes: 8,
  steps: [intro, ...plays, { stepId: 's2', kind: 'summary', text: 'あ' }],
});

test('validateLesson: 色ぬり8面は合格、unfold と unfoldColor の混在は不合格', () => {
  const b = fresh();
  assert.deepEqual(validateLesson('unfold-color-test.json', lessonOf(b.plays, b.intro), ['unfold-color-test']), []);
  const mixed = fresh();
  mixed.plays[0] = { stepId: 'p1', kind: 'play', text: 'あ', unfold: { cols: 5, rows: 3, preset: cs([0, 0], [1, 0], [2, 1], [3, 1], [4, 1]) } };
  const errs = validateLesson('unfold-color-test.json', lessonOf(mixed.plays, mixed.intro), ['unfold-color-test']);
  assert.ok(errs.some((e) => e.includes('unfoldとunfoldColorの混在')), errs.join('\n'));
});

test('validateLesson: unfold-01（lessons/unfold-01-cube.json）は従来どおり合格', () => {
  const data = JSON.parse(readFileSync('lessons/unfold-01-cube.json', 'utf-8'));
  assert.deepEqual(validateLesson('unfold-01-cube.json', data, ['unfold-01-cube']), []);
});
