// routeLesson（インラインのレッスンJSON差し替え）と、solution駆動のclearLessonの確認（Issue #122）。

export const name = 'インラインレッスンをrouteLessonで差し替え、solution（配列・removeIndex）でクリアできる(Issue #122)';
import { routeLesson, clearLesson } from '../helpers.mjs';

const ALL = ['up', 'down', 'left', 'right'];
const LESSON = {
  lessonId: 'inline-smoke',
  unitId: 'inline',
  title: 'テスト',
  type: 'grid-runtime',
  estimatedMinutes: 5,
  steps: [
    { stepId: 's1', kind: 'intro', text: 'ゴールへ いこう' },
    {
      stepId: 'p1',
      kind: 'play',
      text: 'ゴールへ',
      grid: { cols: 3, rows: 3 },
      start: { x: 0, y: 0 },
      goal: { x: 2, y: 1 },
      walls: [{ x: 1, y: 0 }],
      allowedCommands: ALL,
      solution: ['down', 'right', 'right', 'up', 'down'],
      maxCommands: 6,
    },
    {
      stepId: 'p2',
      kind: 'play',
      text: 'ゴールへ',
      grid: { cols: 3, rows: 3 },
      start: { x: 0, y: 0 },
      goal: { x: 2, y: 0 },
      walls: [],
      allowedCommands: ALL,
      solution: { removeIndex: 1 },
      maxCommands: 3,
      initialCommands: ['right', 'down', 'right'],
    },
    { stepId: 's2', kind: 'summary', text: 'できたね' },
  ],
};

export default async function run({ page, check }) {
  await routeLesson(page, LESSON);
  await clearLesson(page, 'inline-smoke');
  await check('全ステージをsolutionでクリアしsummaryへ着く', () => page.getAttribute('#stage', 'data-step'), 'summary');
  await check('差し替えたレッスン名が使われる', () => page.evaluate(() => document.body.innerText.includes('テスト')));
}
