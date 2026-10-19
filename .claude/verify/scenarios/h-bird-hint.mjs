// 小鳥のヒント（Issue #468 段2）：顔アイコンのタップで「とめる」のヒント／失敗後の汎用ヒント、
// 失敗2回目の自動1回（playのみ）。吹き出しは data-sk-bird="bubble"、タップのヒントは data-tap-hint、自動の足し行は data-hint-extra。
// 凍結fixtureに依存しないよう routeLesson のインライン最小盤面で書く。

export const name = 'H-bird-hint: 顔のタップで「とめる」／失敗後のヒント・失敗2回目の自動ヒントは1回だけ(Issue #468 段2)';
import { routeLesson, enterPlay, clickRetry } from '../helpers.mjs';
import { PHRASES } from '../../../js/bird-phrases.js';

const makeLesson = (lessonId, extra) => ({
  lessonId,
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
      grid: { cols: 3, rows: 1 },
      start: { x: 0, y: 0 },
      goal: { x: 2, y: 0 },
      walls: [],
      allowedCommands: ['left', 'right'],
      solution: ['right', 'right'],
      maxCommands: 4,
      ...extra,
    },
    { stepId: 's2', kind: 'summary', text: 'できたね' },
  ],
});

// 文言の正本は js/bird-phrases.js の PHRASES（段3でランダム選択）。場面ごとの文言集合（ギミック別・汎用とも）との照合にする。
const textsOf = (scene) => PHRASES.filter((p) => p.scene === scene).map((p) => p.text);
const STOP_HINTS = textsOf('stop');
const FAIL_HINTS = textsOf('fail');

const bubble = '[data-sk-bird="bubble"]';
const bubbleShown = (page) => page.$eval(bubble, (b) => !b.hidden);
const bubbleText = (page) => page.$eval(bubble, (b) => b.textContent.trim());
const tapHintShown = (page) => page.$eval(bubble, (b) => !b.hidden && b.dataset.tapHint === 'true');

async function waitQuestion(page) {
  await page.waitForFunction(
    (sel) => {
      const b = document.querySelector(sel);
      return b && !b.hidden && b.dataset.question === 'true';
    },
    bubble,
    { timeout: 4000 }
  );
}

export default async function run({ page, check }) {
  // --- 「とめる」のあるステージ：顔のタップでヒント（問い文を消したあと） ---
  await routeLesson(page, makeLesson('bird-hint-stop', { maxPauses: 1 }));
  await enterPlay(page, 'bird-hint-stop');
  await waitQuestion(page);
  await page.click('[data-sk-bird="icon"]');
  await check('stop: 顔のタップで問い文が消える', () => bubbleShown(page), false);
  await page.click('[data-sk-bird="icon"]');
  await check('stop: 次の顔のタップで「とめる」のヒントが出る', () => tapHintShown(page), true);
  await check('stop: ヒントは承認済みの文言', async () => STOP_HINTS.includes(await bubbleText(page)), true);
  await check('stop: ヒントの吹き出しに data-hint は付かない', async () => (await page.$$('[data-hint]')).length, 0);
  await page.click(bubble);
  await check('stop: 吹き出しのタップで消える', () => bubbleShown(page), false);
  await page.click('[data-sk-bird="icon"]');
  await check('stop: 次の顔のタップは問い文に戻る', () => page.$eval(bubble, (b) => !b.hidden && b.dataset.question === 'true'), true);

  // --- 「とめる」の無いステージ：失敗前は問い文だけ、失敗2回目だけ自動ヒントが1行足される ---
  await routeLesson(page, makeLesson('bird-hint-fail', {}));
  await enterPlay(page, 'bird-hint-fail');
  await waitQuestion(page);
  await page.click('[data-sk-bird="icon"]');
  await page.click('[data-sk-bird="icon"]');
  await check('fail: 失敗前の顔のタップは問い文（ヒントなし）', () => page.$eval(bubble, (b) => !b.hidden && b.dataset.question === 'true'), true);

  // 1回目の失敗
  await page.click('[data-command="right"]');
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="retry"]', { timeout: 8000 });
  await check('fail1: 診断のヒントは出る', async () => (await page.$$('[data-hint="goal"]')).length, 1);
  await check('fail1: 自動の足し行は出ない', async () => (await page.$$('[data-hint-extra]')).length, 0);
  await clickRetry(page);

  // 2回目の失敗
  await page.click('[data-command="right"]');
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="retry"]', { timeout: 8000 });
  await check('fail2: 診断のヒントに自動の足し行が1つ付く', async () => (await page.$$('[data-hint="goal"] [data-hint-extra]')).length, 1);
  await check('fail2: 足し行は承認済みの文言', async () => FAIL_HINTS.includes(await page.textContent('[data-hint-extra]')), true);
  await clickRetry(page);

  // 3回目の失敗：もう自動では足さない
  await page.click('[data-command="right"]');
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="retry"]', { timeout: 8000 });
  await check('fail3: 自動の足し行は出ない（1回だけ）', async () => (await page.$$('[data-hint-extra]')).length, 0);
  await clickRetry(page);

  // 失敗後は顔のタップで汎用ヒント（問い文の次）
  await check('fail後: もういちどの直後は吹き出しなし', () => bubbleShown(page), false);
  await page.click('[data-sk-bird="icon"]');
  await check('fail後: 顔のタップで失敗後の汎用ヒントが出る', async () => (await tapHintShown(page)) && FAIL_HINTS.includes(await bubbleText(page)), true);
}
