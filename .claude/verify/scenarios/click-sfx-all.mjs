// クリック音の共通処理（Issue #550 段3）：ボタンを押すと tap が1件だけ鳴る／専用音と二重にならない／
// 受け付けない押下・ミュート中・例外一覧（retry）では tap が増えない。360×640 で確認する。
// 凍結fixtureに依存しないよう routeLesson のインライン最小盤面で書く（シーソーのみ実レッスン）。

export const name = 'click-sfx-all: 全ボタンのクリック音は1押下1件・二重鳴りなし・受け付けない押下/ミュート/retryは無音(Issue #550 段3)';
import { routeLesson, enterPlay, clickRetry } from '../helpers.mjs';

const lesson = {
  lessonId: 'click-sfx-all',
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
      maxCommands: 2,
      groupRepeats: true,
    },
    { stepId: 's2', kind: 'summary', text: 'できたね' },
  ],
};

const log = (page) => page.evaluate(() => [...window.__sfxLog]);
const clearLog = (page) => page.evaluate(() => (window.__sfxLog.length = 0));
const tapCount = async (page) => (await log(page)).filter((n) => n === 'tap').length;
const bubble = '[data-sk-bird="bubble"]';

export default async function run({ page, check }) {
  await page.setViewportSize({ width: 360, height: 640 });
  await routeLesson(page, lesson);
  await enterPlay(page, 'click-sfx-all');
  await page.waitForFunction(
    (sel) => {
      const b = document.querySelector(sel);
      return b && !b.hidden && b.dataset.question === 'true';
    },
    bubble,
    { timeout: 4000 }
  );

  // --- ことり：顔のタップで tap が1件。吹き出しの動きは h-bird-hint と同じ（問い文が消える） ---
  await clearLog(page);
  await page.click('[data-sk-bird="icon"]');
  await check('ことり: tap が1件だけ増える', () => log(page), ['tap']);
  await check('ことり: 吹き出しの動きは従来どおり（問い文が消える）', () => page.$eval(bubble, (b) => b.hidden), true);

  // --- 命令ボタン：最初の1回は tap、同じ方向の2回目は stack だけ（二重に入らない） ---
  await clearLog(page);
  await page.click('[data-command="right"]');
  await check('命令ボタン: 1回目は tap が1件', () => log(page), ['tap']);
  await clearLog(page);
  await page.click('[data-command="right"]');
  await check('命令ボタン: 同じ方向の続けて押しは stack の1件だけ（tap と二重にならない）', () => log(page), ['stack']);
  await clearLog(page);
  await page.click('[data-command="left"]');
  await check('命令ボタン: 別方向は tap が1件', () => log(page), ['tap']);

  // --- 受け付けない押下：上限到達（maxCommands=2、チップ2個の状態でもう1つ）は鳴らさない ---
  await clearLog(page);
  await page.click('[data-command="right"]', { force: true });
  await check('上限到達: 押しても何も鳴らない', () => log(page), []);

  // --- じっこう：1回押して増分1（run のみ）。実行中の命令ボタンは鳴らさない。ためしなおす（retry）は tap なし ---
  await clearLog(page);
  await page.click('[data-action="run"]');
  await check('じっこう: 1回押しの増分は run の1件（tap が足されない）', async () => (await log(page)).filter((n) => n === 'run' || n === 'tap'), ['run']);
  const tapsAfterRun = await tapCount(page);
  await page.click('[data-command="right"]', { force: true });
  await check('実行中: 命令ボタンを押しても tap は増えない', () => tapCount(page), tapsAfterRun);

  await page.waitForSelector('[data-action="retry"]', { timeout: 8000 });
  const tapsBeforeRetry = await tapCount(page);
  await clickRetry(page);
  await check('例外一覧: ためしなおす(retry)は tap が追加されない', () => tapCount(page), tapsBeforeRetry);

  // --- シーソーの端：◀（左端）／▶（右端）は押しても鳴らさない。端でないときは tap が1件 ---
  await enterPlay(page, 'teko-01-tsuriai');
  await clearLog(page);
  await page.click('[data-action="pos-left"]', { force: true });
  await check('シーソー左端: ◀ を押しても鳴らない', () => log(page), []);
  await page.click('[data-action="pos-right"]');
  await check('シーソー: ▶ は tap が1件', () => log(page), ['tap']);
  await page.click('[data-action="pos-right"]');
  await page.click('[data-action="pos-right"]');
  await clearLog(page);
  await page.click('[data-action="pos-right"]', { force: true });
  await check('シーソー右端: ▶ を押しても鳴らない', () => log(page), []);

  // --- ミュート中：どのボタンを押しても鳴らない ---
  await page.evaluate(() => localStorage.setItem('steamkids.sound', 'off'));
  await enterPlay(page, 'click-sfx-all');
  await page.click('[data-sk-bird="icon"]');
  await page.click('[data-command="right"]');
  await page.click('[data-command="left"]');
  await check('ミュート中: __sfxLog は0件のまま', () => page.evaluate(() => window.__sfxLog.length), 0);
  await page.evaluate(() => localStorage.removeItem('steamkids.sound'));
}
