// 盤面（.grid-board）とロボットが盤面エリア（.board-area）内に完全に収まることを、スマホ縦を含む
// 複数viewport・全レッスンのtutorial/predict/playで確認する。#95のc6は「縦スクロール無し」のみを
// 見ており、overflow-hiddenで盤面が切れてロボットが隠れる不具合を検出できなかった（Issue #99）。
// 端末の文字サイズ拡大（ルート文字125%）でボタン文字が折り返し、操作パネルが高くなる場合も見る。

export const name = 'C7 盤面フィット: 盤面・ロボットが盤面エリア内に収まる(Issue #99)';

const VIEWPORTS = [
  { width: 360, height: 640 },
  { width: 375, height: 667 },
  { width: 412, height: 670 },
  { width: 1024, height: 768 },
  { width: 768, height: 1024 },
];
const LESSONS = ['cmd-01-susumu', 'cmd-02-mijikaku', 'cmd-03-naosu', 'donguri-01-hirou', 'donguri-02-mawarimichi'];

// 盤面・ロボットの矩形が盤面エリア・viewportの内側にあるか（1px の丸め誤差は許容）。
async function boardFits(page) {
  return page.evaluate(() => {
    const area = [...document.querySelectorAll('.board-area')].find((e) => e.offsetParent !== null);
    if (!area) return 'no-area';
    const a = area.getBoundingClientRect();
    const inside = (el) => {
      const r = el.getBoundingClientRect();
      return r.top >= a.top - 1 && r.bottom <= a.bottom + 1 && r.left >= a.left - 1 && r.right <= a.right + 1 && r.bottom <= innerHeight + 1;
    };
    const board = area.querySelector('.grid-board');
    const player = area.querySelector('.grid-player');
    if (!board || !player) return 'no-board';
    if (!inside(board)) return `board-out area=${Math.round(a.height)} board=${Math.round(board.getBoundingClientRect().height)}`;
    if (!inside(player)) return 'player-out';
    return 'ok';
  });
}

async function setFontScale(page, scale) {
  await page.addInitScript((s) => {
    document.addEventListener('DOMContentLoaded', () => (document.documentElement.style.fontSize = `${s * 100}%`));
  }, scale);
}

async function runLesson(page, check, lessonId, label) {
  await page.goto(`/index.html?lesson=${lessonId}`);
  await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('steamkids.tutorialDone.')).forEach((k) => localStorage.removeItem(k)));
  await page.goto(`/index.html?lesson=${lessonId}`);
  await page.click('[data-action="start"]');
  if (await page.$('.tutorial-screen')) {
    await check(`${label} ${lessonId} tutorial: 盤面が収まる`, () => boardFits(page), 'ok');
    await page.click('[data-action="skip-tutorial"]');
  }
  // よそう（predict）はIssue #104で全廃。tutorial後は直接play(p1)へ入る。
  await page.waitForSelector('.play-screen .grid-board');
  await check(`${label} ${lessonId} play: 盤面が収まる`, () => boardFits(page), 'ok');
  // 命令を積んでキューにチップが並んだ状態（パネルが最も高くなる状態）でも収まるか
  for (let i = 0; i < 3; i += 1) {
    const btn = await page.$('[data-command]:not(:disabled)');
    if (!btn) break;
    await btn.click();
  }
  await check(`${label} ${lessonId} play(命令3つ): 盤面が収まる`, () => boardFits(page), 'ok');
  await check(`${label} ${lessonId} play: 縦横スクロール無し`, () =>
    page.evaluate(() => {
      const s = document.getElementById('stage');
      return document.documentElement.scrollHeight <= innerHeight && document.documentElement.scrollWidth <= innerWidth && s.scrollHeight <= s.clientHeight;
    })
  );
}

export default async function run({ page, check }) {
  for (const id of ['cmd-01-susumu', 'donguri-01-hirou']) await page.unroute(`**/lessons/${id}.json`);
  for (const vp of VIEWPORTS) {
    await page.setViewportSize(vp);
    for (const id of LESSONS) await runLesson(page, check, id, `${vp.width}x${vp.height}`);
  }
  // 端末の文字サイズ拡大（Android等の文字倍率）を想定
  await setFontScale(page, 1.25);
  for (const vp of VIEWPORTS.slice(0, 3)) {
    await page.setViewportSize(vp);
    for (const id of LESSONS) await runLesson(page, check, id, `${vp.width}x${vp.height}@125%`);
  }
  await checkQueueOverflow(page, check);
}

// 命令をmaxCommandsまで積んだ時、命令列が横スクロールで最新チップを隠さないこと（Issue #102）。
async function queueKeepsLatestVisible(page) {
  return page.evaluate(() => {
    const queue = [...document.querySelectorAll('.command-queue')].find((e) => e.offsetParent !== null);
    if (!queue) return 'no-queue';
    const chips = [...queue.querySelectorAll('.command-chip')];
    const last = chips[chips.length - 1];
    if (!last) return 'no-chip';
    const q = queue.getBoundingClientRect();
    const l = last.getBoundingClientRect();
    return l.right <= q.right + 1 && l.left >= q.left - 1 ? 'ok' : 'hidden';
  });
}

async function checkQueueOverflow(page, check) {
  await page.unroute('**/lessons/donguri-02-mawarimichi.json');
  await page.setViewportSize({ width: 360, height: 640 });
  await page.goto('/index.html?lesson=donguri-02-mawarimichi');
  await page.evaluate(() =>
    Object.keys(localStorage)
      .filter((k) => k.startsWith('steamkids.tutorialDone.'))
      .forEach((k) => localStorage.removeItem(k))
  );
  await page.goto('/index.html?lesson=donguri-02-mawarimichi');
  await page.click('[data-action="start"]');
  // よそう（predict）はIssue #104で全廃。introの「はじめる」から直接play(p1)へ入る。
  await page.waitForSelector('.play-screen .grid-board');
  for (let i = 0; i < 9; i += 1) {
    const btn = await page.$('[data-command]:not(:disabled)');
    if (!btn) break;
    await btn.click();
  }
  await check('play: 命令を積みすぎても最新チップが命令列内に見える', () => queueKeepsLatestVisible(page), 'ok');
}
