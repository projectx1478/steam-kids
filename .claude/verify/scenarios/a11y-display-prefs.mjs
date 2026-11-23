// 表示設定（保護者画面の「もじを おおきく」「うごきを へらす」。Issue #379）。
// 保存（profile）・子ども画面への反映・動きの差し替え・125%でも盤面が収まること・保護者画面が変わらないことを見る。
export const name = 'A11Y 表示設定: もじを おおきく／うごきを へらす(Issue #379)';
import { enterPlay, resetTutorialFlags } from '../helpers.mjs';

const VIEWPORTS = [
  { width: 1024, height: 600 },
  { width: 360, height: 640 },
];
// cmd-02 は devOnly で intro がはみ出す（#797 の判断で対象外。#814 で直したら戻す）
const LESSONS = ['cmd-01-susumu', 'cmd-03-naosu', 'donguri-01-hirou', 'donguri-02-mawarimichi'];

// c7-board-fit の boardFits と同じ判定（共通化はしない）。
async function boardFits(page) {
  return page.evaluate(() => {
    const area = [...document.querySelectorAll('.board-area, [data-sk-screen="board"]')].find((e) => e.offsetParent !== null);
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

const noScroll = (page) =>
  page.evaluate(() => {
    const s = document.getElementById('stage');
    return document.documentElement.scrollHeight <= innerHeight && document.documentElement.scrollWidth <= innerWidth && s.scrollHeight <= s.clientHeight;
  });

async function runLesson(page, check, lessonId, label) {
  await page.goto(`/index.html?lesson=${lessonId}`);
  await resetTutorialFlags(page);
  await page.goto(`/index.html?lesson=${lessonId}`);
  await page.waitForSelector('[data-action="start"]');
  await check(`${label} ${lessonId} intro: 縦横スクロール無し`, () => noScroll(page));
  if (await page.$('[data-sk-screen="board"] .grid-board')) {
    await check(`${label} ${lessonId} intro: 盤面が収まる`, () => boardFits(page), 'ok');
  }
  await page.click('[data-action="start"]');
  await page.waitForSelector('[data-sk-screen="frame"] .grid-board');
  await check(`${label} ${lessonId} play: 盤面が収まる`, () => boardFits(page), 'ok');
  for (let i = 0; i < 3; i += 1) {
    const btn = await page.$('[data-command]:not(:disabled)');
    if (!btn) break;
    await btn.click();
  }
  await check(`${label} ${lessonId} play(命令3つ): 盤面が収まる`, () => boardFits(page), 'ok');
  await check(`${label} ${lessonId} play: 縦横スクロール無し`, () => noScroll(page));
}

// 保護者画面のトグルはゲートの内側にある。a1-sfx-mute と同じ手順で解錠する（解錠はページ読み込みごとに外れる）。
const PASSCODE = 'testtest';
async function openDashboard(page) {
  await page.goto('/dashboard.html');
  await page.evaluate(async (passcode) => {
    const guardian = await import('/js/guardian.js');
    await guardian.setPasscode(passcode);
  }, PASSCODE);
  await page.reload();
  await page.fill('#gate-login-passcode', PASSCODE);
  await page.click('#gate-login-submit');
}

const attrs = (page) => page.evaluate(() => ({ t: document.documentElement.dataset.skText ?? null, m: document.documentElement.dataset.skMotion ?? null }));

export default async function run({ page, check }) {
  // 実レッスン JSON を使う（凍結 fixture の差し替えを外す）。
  for (const id of ['cmd-01-susumu', 'donguri-01-hirou']) await page.unroute(`**/lessons/${id}.json`);

  // --- 保護者画面：既定 OFF → ON → profile に保存 ---
  await openDashboard(page);
  await check('既定: 「もじを おおきく」は aria-pressed=false', () => page.getAttribute('#large-text-toggle', 'aria-pressed'), 'false');
  await check('既定: 「うごきを へらす」は aria-pressed=false', () => page.getAttribute('#reduce-motion-toggle', 'aria-pressed'), 'false');
  await page.click('#large-text-toggle');
  await page.click('#reduce-motion-toggle');
  await check('押すと「もじを おおきく」は true', () => page.getAttribute('#large-text-toggle', 'aria-pressed'), 'true');
  await check('押すと「うごきを へらす」は true', () => page.getAttribute('#reduce-motion-toggle', 'aria-pressed'), 'true');
  await check('profile に largeText・reduceMotion が保存される', () =>
    page.evaluate(() => {
      const p = JSON.parse(localStorage.getItem('steamkids.profile'));
      return [p.largeText, p.reduceMotion];
    }), [true, true]);
  await check('保護者画面は文字 16px のまま', () => page.evaluate(() => getComputedStyle(document.documentElement).fontSize), '16px');
  await check('保護者画面は data-sk-motion が付かない', () => page.evaluate(() => document.documentElement.dataset.skMotion ?? null), null);

  // --- 子ども画面への反映 ---
  await page.setViewportSize({ width: 1024, height: 600 });
  await page.goto('/index.html');
  await check('index.html: data-sk-text=large・data-sk-motion=reduce', () => attrs(page), { t: 'large', m: 'reduce' });
  await check('index.html: 文字が 20px', () => page.evaluate(() => getComputedStyle(document.documentElement).fontSize), '20px');

  // --- 動き：端末は no-preference でもアプリ設定で止まる ---
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/index.html?view=map');
  await page.waitForSelector('button.next-pulse');
  await check('アプリ設定ON: next-pulse の animationName が none', () =>
    page.$eval('button.next-pulse', (b) => getComputedStyle(b).animationName), 'none');
  await check('アプリ設定ON: next-pulse は枠(box-shadow 黄)で示す', () =>
    page.$eval('button.next-pulse', (b) => getComputedStyle(b).boxShadow.includes('rgb(252, 211, 77)')), true);
  await check('アプリ設定ON: prefersReducedMotion() が true', () =>
    page.evaluate(async () => (await import('/js/display-prefs.js')).prefersReducedMotion()), true);

  await page.goto('/index.html?lesson=cmd-01-susumu');
  await resetTutorialFlags(page);
  await enterPlay(page, 'cmd-01-susumu');
  await check('アプリ設定ON: 「スタート！」に animation が付かない', async () => {
    const cue = await page.$('.sk-start-cue');
    return cue ? page.$eval('.sk-start-cue', (el) => getComputedStyle(el).animationName) : 'none';
  }, 'none');
  const sol = await page.evaluate(() => fetch('./lessons/cmd-01-susumu.json').then((r) => r.json()).then((l) => l.steps.find((s) => s.kind === 'play').solution));
  for (const c of Array.isArray(sol) ? sol : sol.commands) await page.click(`[data-command="${c}"]`);
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="next"], [data-action="next-stage"]', { timeout: 15000 });
  await check('アプリ設定ON: クリア結果に紙吹雪 canvas が無い', async () => (await page.$$('canvas[data-clear-confetti]')).length, 0);

  // --- 設定 OFF に戻すと端末の設定だけの挙動 ---
  await openDashboard(page);
  await page.click('#large-text-toggle');
  await page.click('#reduce-motion-toggle');
  await page.goto('/index.html?view=map');
  await page.waitForSelector('button.next-pulse');
  await check('設定OFF・端末 no-preference: next-pulse の animationName が next-pulse', () =>
    page.$eval('button.next-pulse', (b) => getComputedStyle(b).animationName), 'next-pulse');
  await check('設定OFFで data 属性が外れる', () => attrs(page), { t: null, m: null });

  // --- 125% でも盤面が収まる ---
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openDashboard(page);
  await page.click('#large-text-toggle');
  for (const vp of VIEWPORTS) {
    await page.setViewportSize(vp);
    for (const id of LESSONS) await runLesson(page, check, id, `${vp.width}x${vp.height}@大`);
  }
}
