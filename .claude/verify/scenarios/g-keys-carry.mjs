// keys carry（Issue #391）：取っても扉は閉・扉のマスに入って開く・鍵トレイの枠が埋まる・鍵なしで扉に当たると空き枠がゆれる・
// 360px縦で横スクロールなし・reduced-motionで即時・トレイ込みでも盤面が切れない・remote盤にトレイが無い。実レッスンに依存しない。
import { routeLesson, enterPlay, clickRetry } from '../helpers.mjs';

export const name = 'keys carry: 取っても閉・進入で開・鍵トレイの枠・鍵なし衝突で空き枠ゆれ・360px縦で盤面が切れない・remote盤にトレイ無し(Issue #391)';

const board = {
  text: 'ドアは あく？',
  grid: { cols: 5, rows: 3 },
  start: { x: 0, y: 1 },
  goal: { x: 4, y: 1 },
  walls: [{ x: 2, y: 0 }, { x: 2, y: 2 }, { x: 3, y: 0 }, { x: 3, y: 2 }],
  ice: [{ x: 1, y: 1 }],
  keys: [{ x: 0, y: 0, color: 'red' }, { x: 0, y: 2, color: 'blue' }],
  doors: [{ x: 2, y: 1, color: 'red' }, { x: 3, y: 1, color: 'blue' }],
  allowedCommands: ['up', 'down', 'left', 'right'],
  solution: ['up', 'down', 'down', 'up', 'right', 'right', 'right'],
  maxCommands: 9,
};
const makeLesson = (lessonId, extra) => ({
  lessonId,
  unitId: 'g-keys',
  title: 'keys carry',
  type: 'grid-runtime',
  estimatedMinutes: 5,
  steps: [
    { stepId: 's1', kind: 'intro', text: 'かぎ' },
    { stepId: 'p1', kind: 'play', ...board, ...extra },
    { stepId: 's2', kind: 'summary', text: 'おわり' },
  ],
});
// keyMode省略＝carry（既定）。remoteは明示。
const carryLesson = makeLesson('g-keys-carry', {});
const remoteLesson = makeLesson('g-keys-carry-remote', { keyMode: 'remote' });

const SOLUTION = ['up', 'down', 'down', 'up', 'right', 'right', 'right'];
const doorsOpen = (page) => page.$$eval('.grid-cell[data-door]', (cs) => cs.map((c) => c.dataset.doorOpen).join());
const filled = (page) => page.$$eval('.key-slot[data-filled="true"]', (s) => s.map((e) => e.dataset.color).join());
const pushSolution = async (page) => {
  for (const c of SOLUTION) await page.click(`[data-command="${c}"]`);
};

export default async function run({ page, check }) {
  await routeLesson(page, carryLesson);
  await routeLesson(page, remoteLesson);
  await page.setViewportSize({ width: 360, height: 640 });

  // --- carry・reduced-motion（既定）：描画・取っても閉・進入で開・即時 ---
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enterPlay(page, carryLesson.lessonId);
  await check('鍵トレイが1行・問い文の行の直下にある', () =>
    page.evaluate(() => {
      const q = document.querySelector('[data-sk-screen="question"]');
      const t = document.querySelector('.key-tray');
      return document.querySelectorAll('.key-tray').length === 1 && q.nextElementSibling === t && t.classList.contains('sk-key-tray-row');
    }), true);
  await check('色の数(2)だけ空き枠が最初から出る', () => page.$$eval('.key-slot', (s) => s.map((e) => `${e.dataset.color}:${e.dataset.filled ?? 'empty'}`).join()), 'red:empty,blue:empty');
  await check('枠は48pxの正方形', () => page.$$eval('.key-slot', (s) => s.map((e) => { const r = e.getBoundingClientRect(); return `${Math.round(r.width)}x${Math.round(r.height)}`; }).join()), '48x48,48x48');
  await check('空き枠は点線', () => page.$$eval('.key-slot', (s) => s.every((e) => getComputedStyle(e).borderTopStyle === 'dashed')), true);
  await check('360px縦で横スクロールなし', () => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
  await check('トレイ込みでも盤面が切れない', () =>
    page.evaluate(() => {
      const area = document.querySelector('[data-sk-screen="board"]').getBoundingClientRect();
      const b = document.querySelector('[data-sk-screen="board"] .grid-cell').parentElement.getBoundingClientRect();
      return b.left >= area.left - 0.5 && b.right <= area.right + 0.5 && b.top >= area.top - 0.5 && b.bottom <= area.bottom + 0.5;
    }), true);

  await pushSolution(page);
  await page.click('[data-action="step"]');
  await check('鍵を取るとトレイの赤の枠が埋まる(青は空き)', () => filled(page), 'red');
  await check('取っても扉は閉じたまま(carry)', () => doorsOpen(page), 'false,false');
  await check('取った鍵は盤面から消える', async () => (await page.$$('.grid-cell .grid-key-svg')).length, 1);
  await check('reduced-motionでは枠の鍵に弾む演出が付かない(即時)', async () => (await page.$$('.key-slot .spring-in')).length, 0);
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="next"]', { timeout: 15000 });
  await check('扉のマスに入ると両方の扉が開く', () => doorsOpen(page), 'true,true');
  await check('両方の枠が埋まったまま', () => filled(page), 'blue,red');

  // --- carry・動きあり：弾む演出・鍵なし衝突で空き枠がゆれる ---
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await enterPlay(page, carryLesson.lessonId);
  await pushSolution(page);
  await page.click('[data-action="step"]');
  await check('動きありでは枠の鍵に弾む演出(spring-in)が付く', async () => (await page.$$('.key-slot[data-color="red"] .spring-in')).length, 1);
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="next"]', { timeout: 15000 });

  await enterPlay(page, carryLesson.lessonId);
  await page.evaluate(() => {
    window.__slotShake = [];
    new MutationObserver((ms) => ms.forEach((m) => {
      if (m.target.classList?.contains('key-slot-shake')) window.__slotShake.push(m.target.dataset.color);
    })).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] });
  });
  await page.click('[data-command="right"]');
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="retry"]', { timeout: 10000 });
  await check('鍵なしで赤い扉に当たると、赤の空き枠だけゆれる', () => page.evaluate(() => [...new Set(window.__slotShake)].join()), 'red');
  await check('当たっても扉は閉じたまま', () => doorsOpen(page), 'false,false');
  await clickRetry(page);
  await check('もういちどでトレイは空き枠に戻る', () => filled(page), '');

  // --- reduced-motion：ゆらさない ---
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enterPlay(page, carryLesson.lessonId);
  await page.evaluate(() => {
    window.__slotShake = [];
    new MutationObserver((ms) => ms.forEach((m) => {
      if (m.target.classList?.contains('key-slot-shake')) window.__slotShake.push(m.target.dataset.color);
    })).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] });
  });
  await page.click('[data-command="right"]');
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="retry"]', { timeout: 10000 });
  await check('reduced-motionでは空き枠をゆらさない', () => page.evaluate(() => window.__slotShake.length), 0);

  // --- remote：トレイを出さず、取った瞬間に扉が開く ---
  await enterPlay(page, remoteLesson.lessonId);
  await check('remote盤には鍵トレイが無い', async () => (await page.$$('.key-tray, .key-slot')).length, 0);
  await pushSolution(page);
  await page.click('[data-action="step"]');
  await check('remote：赤い鍵を取った瞬間に赤い扉が開く', () => doorsOpen(page), 'true,false');
}
