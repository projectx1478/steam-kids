// sort-order（レシピの順番）：エンジン純関数と validate（Issue #292 段1）。盤は test/fixtures/sortorder/（設計の21盤）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { firstViolation, isSolved, countSolutions, solutionsOf } from '../js/engine-sortorder.js';
import { checkSortFace, validateSortOrder } from '../tools/lib/validate/sortorder.mjs';
import { validateLesson } from '../tools/validate-lessons.mjs';

const DIR = 'test/fixtures/sortorder';
const load = (n) => JSON.parse(readFileSync(`${DIR}/${n}.json`, 'utf-8'));
const names = readdirSync(DIR).filter((f) => f.endsWith('.json')).map((f) => f.replace('.json', ''));

// 設計 approved.md の sort-01 8面
const C = (id, icon, text) => ({ id, icon, text });
const B = (a, b, fail) => (fail ? { a, b, fail } : { a, b });
const faces = [
  ['p1', [C('sara', '🍽️', 'おさらに のせる'), C('wa', '🥚', 'たまごを わる'), C('yaku', '🍳', 'フライパンで やく')], [B('wa', 'yaku', 'raw'), B('yaku', 'sara', 'empty')]],
  ['p2', [C('bata', '🧈', 'バターを のせる'), C('hikku', '🥞', 'ひっくりかえす'), C('nagasu', '🥣', 'たねを ながす')], [B('nagasu', 'hikku', 'spill'), B('hikku', 'bata', 'spill')]],
  ['p3', [C('kakeru', '🍛', 'ごはんに かける'), C('nikomu', '🍲', 'にこむ'), C('kiru', '🥕', 'やさいを きる'), C('itame', '🍳', 'いためる')], [B('kiru', 'itame', 'raw'), B('itame', 'nikomu', 'burn'), B('nikomu', 'kakeru', 'empty')]],
  ['p4', [C('kiru', '🥪', 'はんぶんに きる'), C('ham', '🥓', 'ハムを のせる'), C('nuru', '🧈', 'バターを ぬる'), C('pan', '🍞', 'パンを ならべる')], [B('pan', 'nuru', 'spill'), B('pan', 'ham', 'spill'), B('nuru', 'kiru'), B('ham', 'kiru')]],
  ['p5', [C('eat', '🍚', 'いただきます'), C('fuku', '🧽', 'テーブルを ふく'), C('wash', '🧼', 'てを あらう'), C('oku', '🥢', 'おはしを ならべる')], [B('fuku', 'oku'), B('oku', 'eat'), B('wash', 'eat')]],
  ['p6', [C('drain', '🥣', 'ざるに あげる'), C('boil', '🫕', 'おゆを わかす'), C('negi', '🧅', 'ねぎを のせる'), C('men', '🍜', 'めんを ゆでる'), C('bowl', '🥡', 'どんぶりに いれる')], [B('boil', 'men', 'raw'), B('men', 'drain', 'empty'), B('drain', 'bowl', 'spill'), B('bowl', 'negi')]],
  ['p7', [C('tsutsumu', '🎁', 'ふろしきで つつむ'), C('futa', '🍱', 'ふたを しめる'), C('cha', '🧃', 'おちゃを いれる'), C('okazu', '🥦', 'おかずを つめる'), C('gohan', '🍙', 'ごはんを つめる')], [B('gohan', 'futa', 'empty'), B('okazu', 'futa', 'empty'), B('futa', 'tsutsumu', 'spill')]],
  ['p8', [C('yaku', '🔥', 'オーブンで やく'), C('noseru', '🧀', 'チーズを のせる'), C('kiru', '🔪', 'チーズを きる'), C('nuru', '🍅', 'ソースを ぬる'), C('nobasu', '🫓', 'きじを のばす')], [B('nobasu', 'nuru', 'spill'), B('nuru', 'noseru'), B('kiru', 'noseru'), B('noseru', 'yaku', 'raw')]],
].map(([stepId, cards, before]) => ({ stepId, kind: 'play', text: 'ためす', sortOrder: { cards, before } }));

test('engine-sortorder: firstViolation は before の配列順で先頭の違反を返す（決定的）', () => {
  const before = [{ a: 'x', b: 'y', fail: 'raw' }, { a: 'y', b: 'z' }];
  assert.equal(firstViolation(['z', 'y', 'x'], before), before[0]);
  assert.equal(firstViolation(['z', 'y', 'x'], before), before[0], '同じ並びなら毎回同じ');
  assert.equal(firstViolation(['x', 'z', 'y'], before), before[1]);
  assert.equal(firstViolation(['x', 'y', 'z'], before), null);
  assert.equal(isSolved(['x', 'y', 'z'], before), true);
  assert.equal(isSolved(['y', 'x', 'z'], before), false);
});

test('engine-sortorder: solutionsOf／countSolutions（分岐の正解は2通り）', () => {
  const cards = [{ id: 'd' }, { id: 'c' }, { id: 'b' }, { id: 'a' }];
  const before = [B('a', 'b'), B('a', 'c'), B('b', 'd'), B('c', 'd')];
  assert.deepEqual(solutionsOf(cards, before), [['a', 'c', 'b', 'd'], ['a', 'b', 'c', 'd']]);
  assert.equal(countSolutions(cards, before), 2);
});

test('engine-sortorder: 設計の8面は別の正解順列が「ためす」で通り、各面の正解数が設計どおり', () => {
  const expected = [1, 1, 1, 2, 3, 1, 10, 3];
  faces.forEach((f, i) => {
    const { cards, before } = f.sortOrder;
    const sols = solutionsOf(cards, before);
    assert.equal(sols.length, expected[i], f.stepId);
    for (const s of sols) assert.equal(isSolved(s, before), true);
    assert.equal(isSolved(cards.map((c) => c.id), before), false, `${f.stepId} の start は不正解`);
  });
});

const run = (f) => { const e = []; validateSortOrder(f, (r, d) => e.push(`${r}: ${d}`), true); return e; };

test('validate: 設計の8面（sort-01 の組）は合格', () => {
  assert.deepEqual(run(faces), []);
});

test('validate: sort-order のレッスンは validateLesson からも検査される', () => {
  const lesson = {
    lessonId: 'sort-t', unitId: 'u', title: 't', type: 'sort-order', estimatedMinutes: 8,
    steps: [{ stepId: 's1', kind: 'intro', text: 'ならべよう' }, ...faces, { stepId: 's2', kind: 'summary', text: 'おわり' }],
  };
  assert.deepEqual(validateLesson('sort-t.json', lesson, ['sort-t']), []);
  assert.ok(validateLesson('sort-t.json', lesson, []).some((e) => e.includes('長尺試作')), 'longTrialIds 外は不合格');
});

// 不合格盤：fixture 名 → 出るはずの規則名
const FAIL_RULE = {
  'fail-redundant': 'beforeの必須性', 'fail-cycle': '循環', 'fail-start-solved': 'startが正解',
  'fail-count6': 'カード枚数', 'fail-count2': 'カード枚数', 'fail-dup-id': 'カードid重複', 'fail-icon2': 'カードのicon',
  'fail-text21': '文字数', 'fail-text-kanji': 'ルビ外の漢字', 'fail-text-negative': '否定語',
  'fail-before-empty': 'beforeの本数', 'fail-unknown-id': 'beforeのid', 'fail-selfloop': 'beforeの自己ループ',
  'fail-fail-unknown': 'failの値', 'lesson-dup-face': '面の重複', 'lesson-7faces': '盤面の必須',
  'lesson-count-decrease': '難易度の順序', 'lesson-all-total': '全順序の面', 'lesson-uncon-card2': '制約に出ないカード',
};

function judge(name) {
  const board = load(name);
  const errors = [];
  const add = (r, d) => errors.push(`${r}: ${d}`);
  if (name.startsWith('lesson-')) validateSortOrder(board.plays.map((p) => ({ kind: 'play', ...p })), add, true);
  else checkSortFace(board, add, 'x ');
  return errors;
}

test('validate: 21盤すべてを fixture にしている（合格2・不合格19）', () => {
  assert.equal(names.length, 21);
  assert.equal(names.filter((n) => n.startsWith('pass-')).length, 2);
  assert.equal(Object.keys(FAIL_RULE).length, 19);
});

for (const n of ['pass-chain3', 'pass-branch4']) {
  test(`validate 盤 ${n}: 合格`, () => assert.deepEqual(judge(n), []));
}
for (const [n, rule] of Object.entries(FAIL_RULE)) {
  test(`validate 盤 ${n}: 不合格（${rule}）`, () => {
    const errors = judge(n);
    assert.ok(errors.length > 0, '不合格になる');
    assert.ok(errors.some((e) => e.startsWith(rule)), `${rule} が出る: ${errors.join(' | ')}`);
  });
}
