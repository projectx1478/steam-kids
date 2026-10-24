// 壁・盤外にぶつかった手で実行を止める、と失敗→ためしなおすの画面暗転（Issue #136）。
// 凍結fixtureに依存しないようrouteLessonのインライン最小盤面で書く。

export const name = '衝突した手で実行が止まり、ためしなおすで画面暗転を挟んでからスタートに戻る(Issue #136)';
import { routeLesson, enterPlay } from '../helpers.mjs';

const LESSON = {
  lessonId: 'bump-stop-smoke',
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
      grid: { cols: 5, rows: 3 },
      start: { x: 0, y: 0 },
      goal: { x: 4, y: 2 },
      walls: [],
      allowedCommands: ['up', 'down', 'left', 'right'],
      solution: ['right', 'right', 'right', 'right', 'down', 'down'],
      maxCommands: 8,
    },
    { stepId: 's2', kind: 'summary', text: 'できたね' },
  ],
};

// ロボット（.grid-player）の中心が入っているマスの座標。
const robotCell = (page) =>
  page.evaluate(() => {
    const r = document.querySelector('.grid-player').getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    for (const c of document.querySelectorAll('[data-x][data-y]')) {
      const b = c.getBoundingClientRect();
      if (cx >= b.left && cx <= b.right && cy >= b.top && cy <= b.bottom) return `${c.dataset.x},${c.dataset.y}`;
    }
    return null;
  });
const footprints = async (page) => (await page.$$('.grid-footprint')).length;

export default async function run({ page, check }) {
  await routeLesson(page, LESSON);

  // 既定のreduced-motion（config.mjs）では暗転しないため、ここだけ通常モーションで確認する。
  await page.emulateMedia({ reducedMotion: 'no-preference' });

  // --- じっこう: right,right,left,left,left(盤外でぶつかる),right,right ---
  await enterPlay(page, 'bump-stop-smoke');
  // 問い文の吹き出し（Issue #497 段B）は盤面の置き物（ロボット・ゴール）を覆わず、盤面エリアの内側に出る
  await page.waitForSelector('[data-sk-bird="bubble"]:not([hidden])', { timeout: 4000 });
  await check('問い文の吹き出しがロボット・ゴールのマスを覆わない', () =>
    page.evaluate(() => {
      const b = document.querySelector('[data-sk-bird="bubble"]').getBoundingClientRect();
      const hit = (el) => {
        const r = el.getBoundingClientRect();
        return r.left < b.right && r.right > b.left && r.top < b.bottom && r.bottom > b.top;
      };
      return [...document.querySelectorAll('.grid-player, [data-goal]')].some(hit);
    }), false);
  for (const c of ['right', 'right', 'left', 'left', 'left', 'right', 'right']) {
    await page.click(`[data-command="${c}"]`);
  }
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="retry"]', { timeout: 8000 });
  // 衝突後に残りの手(right,right)が再生されていれば、足あとが増えるかロボットが動く。
  await page.waitForTimeout(1500);
  await check('衝突より後の手の足あとが増えない（4個）', () => footprints(page), 4);
  await check('ロボットは衝突マスのまま', () => robotCell(page), '0,0');
  await check('ためしなおすだけ押せる', () => page.$eval('[data-action="retry"]', (b) => b.disabled), false);
  await check('パレットはロック', async () => (await page.$$('[data-command]:not([disabled])')).length, 0);

  // --- ためしなおす: 暗転が出てから消え、盤面がstartへ戻る（「スタート！」は出さない） ---
  await page.click('[data-action="retry"]');
  await check('暗転の黒幕が出る', async () => (await page.waitForSelector('[data-transition="retry"]', { timeout: 1000 })) !== null, true);
  await check(
    '暗転中はタップを遮る（黒幕が最前面）',
    () => page.evaluate(() => document.elementFromPoint(innerWidth / 2, innerHeight / 2)?.dataset.transition),
    'retry'
  );
  await page.waitForFunction(() => !document.querySelector('[data-transition="retry"]'), null, { timeout: 4000 });
  await check('暗転が消える', async () => (await page.$$('[data-transition="retry"]')).length, 0);
  await check('盤面がstartに戻る', () => robotCell(page), '0,0');
  await check('足あとが消える', () => footprints(page), 0);
  await check('再開時はスタート！が出ない（出るのはステージ開始時のみ。#497）', async () => (await page.$$('.sk-start-cue')).length, 0);
  // 失敗後の ためしなおす は列を残す（#545）。空の列から始める前提を保つため ぜんぶけす で空にする。
  await page.click('[data-action="clear-all"]');
  await check('命令列が空に戻る', async () => (await page.$$('.command-chip')).length, 0);

  // --- 1コマ（reduced-motion）: 1タップ目(left)が盤外で終わる。retryは暗転せず即時に作り直す ---
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enterPlay(page, 'bump-stop-smoke');
  for (const c of ['left', 'right', 'right']) await page.click(`[data-command="${c}"]`);
  await page.click('[data-action="step"]');
  await check('1タップ目(left)で衝突→止まる', async () => (await page.$$('[data-action="retry"]')).length, 1);
  await check('衝突したタップで1コマ自体もdisabled', () => page.$eval('[data-action="step"]', (b) => b.disabled), true);
  await check('足あとは増えない', () => footprints(page), 0);
  await page.click('[data-action="retry"]');
  await check('reduced-motionでは暗転しない', async () => (await page.$$('[data-transition="retry"]')).length, 0);
  await check('ためしなおす後にじっこうへ戻る', async () => (await page.$$('[data-action="run"]')).length, 1);
}
