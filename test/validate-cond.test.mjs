// 条件分岐 {if,then} の validate（Issue #291）。盤は test/fixtures/cond/ の合格盤・不合格盤。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateLesson } from '../tools/lib/validate/lesson.mjs';

const read = (name) => JSON.parse(readFileSync(`test/fixtures/cond/${name}.json`, 'utf-8'));
const cmd04 = JSON.parse(readFileSync('lessons/cmd-04-kurikaeshi.json', 'utf-8'));
const intro = cmd04.steps.find((s) => s.kind === 'intro');
const summary = cmd04.steps.find((s) => s.kind === 'summary');
const FILE = 'cmd-99-test.json';

function lessonOf(plays, introStep = intro) {
  return {
    lessonId: 'cmd-99-test',
    unitId: cmd04.unitId,
    title: 'ためし',
    type: 'grid-runtime',
    estimatedMinutes: 5,
    steps: [introStep, ...plays, summary],
  };
}
// 不合格盤を p1、合格盤 A-3 を p2 に置く（難易度の順序の差は期待の規則名の有無だけを見る）。
function validateBoard(name) {
  const p1 = { ...read(name), stepId: 'p1' };
  const p2 = { ...read('291-A-3'), stepId: 'p2' };
  return validateLesson(FILE, lessonOf([p1, p2]));
}

test('validate-cond: 合格盤 A-1〜3 は検証を通る', () => {
  const plays = [1, 2, 3].map((n) => ({ ...read(`291-A-${n}`), stepId: `p${n}` }));
  assert.deepEqual(validateLesson(FILE, lessonOf(plays)), []);
});

const cases = [
  ['type', 'condBlockの型'],
  ['noflag', 'solutionの形式'],
  ['repeatbox', 'condBlockの併用'],
  ['grouprepeats', 'condBlockの併用'],
  ['maxpauses', 'condBlockの併用'],
  ['gimmick', 'condBlockの併用'],
  ['doors', 'condBlockの併用'],
  ['keymode', 'condBlockの併用'],
  ['pits', 'condBlockの併用'],
  ['bridge', 'condBlockの併用'],
  ['watermode', 'condBlockの併用'],
  ['groupwalls', 'condBlockの併用'],
  ['initial', 'condBlockの併用'],
  ['then0', 'thenの個数'],
  ['then4', 'thenの個数'],
  ['then-notallowed', 'thenの方向'],
  ['ifdir', 'ifの方向'],
  ['nest', '条件の入れ子'],
  ['extrakey', '条件カードのキー'],
  ['nosolution', 'solutionの必須'],
  ['maxcmd', 'solutionの手数'],
  ['clear', 'solutionのクリア'],
  ['alltrue', '条件が飾り（常に真でクリア）'],
  ['allfalse', '条件が飾り（常に偽でクリア）'],
  ['necessity', '条件の必須性'],
  ['solobj', 'solutionの形式'],
];
for (const [name, rule] of cases) {
  test(`validate-cond: 不合格盤 ${name} は ${rule}`, () => {
    const errors = validateBoard(`291-A-fail-${name}`);
    assert.ok(errors.some((e) => e.includes(`: ${rule}: `)), `${rule} が出ない: ${errors.join(' / ')}`);
  });
}

test('validate-cond: intro の demo に {if,then} を書くと命令語彙で不合格', () => {
  const demoIntro = read('291-A-fail-demo');
  const plays = [1, 2, 3].map((n) => ({ ...read(`291-A-${n}`), stepId: `p${n}` }));
  const errors = validateLesson(FILE, lessonOf(plays, demoIntro));
  assert.ok(errors.some((e) => e.includes(': 命令語彙: ')), errors.join(' / '));
});
