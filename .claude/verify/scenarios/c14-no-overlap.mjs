// 吹き出し欄と盤面・操作ボタン・指ガイドが交差しない（4端末×通常・失敗、代表 cmd・ice・key・switch・teko）、
// 長い文の横スライド（末尾到達）、8px以上のスライドでは吹き出しが消えず8px未満のタップでは消える、
// 初回の「流れて戻る」動きはセッションで1回だけ（Issue #544 段2）。
// 期待値は isEqual（正規表現は使えない）。期待値なしの check は真偽。

export const name = 'C14 吹き出し欄の重なり: 4端末×通常・失敗で盤面・ボタン・指ガイドと交差しない／横スライド／初回の動きは1回(Issue #544)';
import { enterPlay, clickRetry } from '../helpers.mjs';

const VIEWPORTS = [
  { width: 360, height: 640 },
  { width: 844, height: 390 },
  { width: 768, height: 1024 },
  { width: 1280, height: 800 },
];

// handTarget: 指ガイドが指す要素（未クリアの最初のステージで出る）。
const LESSONS = [
  { id: 'cmd-02-mijikaku', handTarget: '[data-command]' },
  { id: 'ice-01-suberu', handTarget: '[data-command]' },
  { id: 'key-01-kagi', handTarget: '[data-command]' },
  { id: 'switch-01-suicchi', handTarget: '[data-command]' },
  { id: 'teko-01-tsuriai', handTarget: '[data-action="pos-right"]', seesaw: true },
];

const BUBBLE = '[data-sk-bird="bubble"]';

// ページ内で測る：吹き出しが欄の中にあり、盤面・命令列・操作ボタン・指ガイドと交差しない。指ガイドは指す先のボタンと交差しない。
const measure = (handTarget) => {
  const r = (el) => el.getBoundingClientRect();
  const hit = (a, b) => b.width > 0 && b.height > 0 && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  const bubbleEl = document.querySelector('[data-sk-bird="bubble"]:not([hidden])');
  const lane = r(document.querySelector('[data-sk-screen="bird-lane"]'));
  const board = r(document.querySelector('[data-sk-screen="board"]'));
  const out = { bubble: !!bubbleEl, laneBoard: hit(lane, board) };
  if (bubbleEl) {
    const b = r(bubbleEl);
    out.inLane = b.left >= lane.left - 1 && b.right <= lane.right + 1 && b.top >= lane.top - 1 && b.bottom <= lane.bottom + 1;
    out.hitBoard = hit(b, board);
    const others = [...document.querySelectorAll('.command-queue, [data-sk-screen="panel"] button, [data-sk-screen="actions"] button, .palette-row button')];
    out.hitControls = others.filter((el) => hit(b, r(el))).length;
    out.visibleBubbles = document.querySelectorAll('[data-sk-bird="bubble"]:not([hidden])').length;
    const handEl = document.querySelector('.hand-hint');
    out.hitHand = handEl ? hit(b, r(handEl)) : false;
  }
  const handEl = document.querySelector('.hand-hint');
  out.hand = !!handEl;
  if (handEl) {
    const h = r(handEl);
    const t = document.querySelector(handTarget);
    out.handHitTarget = t ? hit(h, r(t)) : null;
    out.handHitBoard = hit(h, board);
  }
  return out;
};

async function waitQuestion(page) {
  await page.waitForFunction(
    (sel) => {
      const b = document.querySelector(sel);
      return b && !b.hidden && b.dataset.question === 'true';
    },
    BUBBLE,
    { timeout: 8000 }
  );
}

// 1手だけ積んで実行し、失敗（ためしなおす）まで待つ。seesaw は動かさず実行する。
async function failOnce(page, lesson) {
  if (!lesson.seesaw) await page.locator('.palette-row [data-command]:not([disabled])').first().click();
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="retry"]', { timeout: 12000 });
  await page.waitForSelector(`${BUBBLE} [data-hint]`, { timeout: 4000 });
}

export default async function run({ page, check }) {
  // --- 4端末 × 通常・失敗 × 代表レッスン ---
  for (const vp of VIEWPORTS) {
    for (const lesson of LESSONS) {
      const label = `${vp.width}x${vp.height} ${lesson.id}`;
      await page.setViewportSize(vp);
      await enterPlay(page, lesson.id);
      await waitQuestion(page);
      const normal = await page.evaluate(measure, lesson.handTarget);
      await check(`${label} 通常: 吹き出しが欄の中`, () => normal.bubble && normal.inLane, true);
      await check(`${label} 通常: 欄と盤面が交差しない`, () => normal.laneBoard, false);
      await check(`${label} 通常: 吹き出しが盤面と交差しない`, () => normal.hitBoard, false);
      await check(`${label} 通常: 吹き出しが命令列・ボタンと交差しない`, () => normal.hitControls, 0);
      await check(`${label} 通常: 指ガイドが指す先のボタンを隠さない`, () => (normal.hand ? normal.handHitTarget === false : true));
      await check(`${label} 通常: 指ガイドが吹き出しと交差しない`, () => normal.hitHand, false);

      await failOnce(page, lesson);
      const fail = await page.evaluate(measure, lesson.handTarget);
      await check(`${label} 失敗: 吹き出しが欄の中に1つだけ`, () => fail.bubble && fail.inLane && fail.visibleBubbles === 1, true);
      await check(`${label} 失敗: 吹き出しが盤面と交差しない`, () => fail.hitBoard, false);
      await check(`${label} 失敗: 吹き出しが命令列・ボタンと交差しない`, () => fail.hitControls, 0);
      await check(`${label} 失敗: おしい！とヒントは別の場所に出ない（data-hint は1つ）`, async () => (await page.$$('[data-hint]')).length, 1);
      await page.goto('/index.html');
    }
  }

  // --- 横スライド・タップ・初回の動き（360×640、通常モーション）---
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.setViewportSize({ width: 360, height: 640 });
  const lesson = LESSONS[0];
  await enterPlay(page, lesson.id);
  // 吹き出しの中の文が動き出した回数（0 から正の値へ変わった回数。触らない間の合図の動きを数える）
  await page.evaluate(() => {
    window.__nudges = 0;
    let prev = 0;
    const tick = () => {
      const t = document.querySelector('[data-sk-bird="bubble"] .sk-bird-track');
      const cur = t ? t.scrollLeft : 0;
      if (prev === 0 && cur > 0) window.__nudges += 1;
      prev = cur;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await waitQuestion(page);
  await failOnce(page, lesson); // 1回目の失敗：長い文が出て、初回の合図が1回
  await page.waitForTimeout(1200);
  await clickRetry(page);
  await failOnce(page, lesson); // 2回目の失敗：もう合図は出ない
  await page.waitForTimeout(1200);
  await check('初回の流れて戻る動きはセッションで1回だけ', () => page.evaluate(() => window.__nudges), 1);

  const track = `${BUBBLE} .sk-bird-track`;
  const state = () =>
    page.$eval(track, (t) => ({ over: t.scrollWidth - t.clientWidth, left: t.scrollLeft, end: t.scrollLeft + t.clientWidth >= t.scrollWidth - 1 }));
  const shown = () => page.$eval(BUBBLE, (b) => !b.hidden);
  const more = () => page.$eval(BUBBLE, (b) => b.dataset.more === 'true');
  await check('長い文が1行に収まらず、続きのマーカーが出ている', async () => (await state()).over > 0 && (await more()), true);
  const box = await page.locator(BUBBLE).boundingBox();
  const y = box.y + box.height / 2;
  const xr = box.x + box.width - 40;
  // 8px以上動かす（スライド）：消えず、文が動く
  await page.mouse.move(xr, y);
  await page.mouse.down();
  await page.mouse.move(xr - 40, y, { steps: 6 });
  await page.mouse.up();
  await check('8px以上のスライドでは吹き出しが消えない', shown, true);
  await check('スライドで文が動く', async () => (await state()).left > 0);
  // 末尾まで滑らせる
  for (let i = 0; i < 8 && !(await state()).end; i += 1) {
    await page.mouse.move(xr, y);
    await page.mouse.down();
    await page.mouse.move(xr - 120, y, { steps: 6 });
    await page.mouse.up();
  }
  await check('スライドで文の末尾に着く', async () => (await state()).end, true);
  await check('末尾に着くと続きのマーカーが消える', more, false);
  await check('末尾までスライドしても吹き出しは消えない', shown, true);
  // 8px未満（タップ）：消える
  await page.mouse.move(xr, y);
  await page.mouse.down();
  await page.mouse.move(xr + 3, y);
  await page.mouse.up();
  await check('8px未満のタップで吹き出しが消える', shown, false);
}
