// ステージ開始時の「スタート！」（盤面中央・A案）：開始時に1回出て約2秒で消える・タップ素通し・
// 失敗→ためしなおす／クリア→ためしなおすの再開では出ない（play・seesaw 各。Issue #497 段A）。
// 段B：問い文の吹き出しは「スタート！」が消えてから出る（順序 スタート！→吹き出し）。顔・吹き出しのタップで消え／再表示。
// 凍結fixtureに依存しないよう play は routeLesson のインライン最小盤面、seesaw は teko-01-tsuriai。

export const name = 'C12 スタート！: ステージ開始時に1回・約2秒で消える・再開（ためしなおす）では出ない(play・seesaw。Issue #497)';
import { routeLesson, enterPlay, clickRetry } from '../helpers.mjs';

const LESSON = {
  lessonId: 'start-cue-smoke',
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
    },
    { stepId: 's2', kind: 'summary', text: 'できたね' },
  ],
};

const cueCount = (page) => page.$$eval('.sk-start-cue', (els) => els.length);
const bubbleShown = (page) => page.$eval('[data-sk-bird="bubble"]', (b) => !b.hidden && b.dataset.question === 'true');
const cueFlag = (page) => page.$eval('[data-sk-screen="board"]', (b) => b.hasAttribute('data-start-cue'));

// 開始時の確認（1回出る→タップ素通し→約2秒後に消える。Issue #544-3A）。enterPlay の直後に呼ぶ。
async function checkStartThenGone(page, check, label) {
  await check(`${label}: 開始時に「スタート！」が1回出る`, () => cueCount(page), 1);
  await check(`${label}: 表示中は盤面に data-start-cue が立つ`, () => cueFlag(page), true);
  await check(`${label}: 「スタート！」の間は問い文の吹き出しは出ない`, () => bubbleShown(page), false);
  await check(`${label}: タップは素通し（pointer-events:none）`, () =>
    page.$eval('.sk-start-cue', (el) => getComputedStyle(el).pointerEvents), 'none');
  await page.waitForTimeout(1200);
  await check(`${label}: 1.2秒後もまだ出ている（1秒では消えない）`, () => cueCount(page), 1);
  await page.waitForFunction(() => !document.querySelector('.sk-start-cue'), null, { timeout: 5000 });
  await check(`${label}: 約2秒後に消える`, () => cueCount(page), 0);
  await check(`${label}: 消えたら data-start-cue も外れる`, () => cueFlag(page), false);
  await check(`${label}: 「スタート！」が消えたあと問い文の吹き出しが出る`, () => bubbleShown(page), true);
}

export default async function run({ page, check }) {
  // --- play ---
  await routeLesson(page, LESSON);
  await enterPlay(page, 'start-cue-smoke');
  await checkStartThenGone(page, check, 'play');

  // 吹き出しをタップで消す → 顔をタップで再表示（自動では消えない。盤面・操作ボタンのタップは素通し）
  await page.click('[data-sk-bird="bubble"]');
  await check('play: 吹き出しのタップで消える', () => bubbleShown(page), false);
  await page.click('[data-sk-bird="icon"]');
  await check('play: 顔のタップで問い文が再表示される', () => bubbleShown(page), true);

  // 失敗（right 1回ではゴールに着かない）→ ためしなおす
  await page.click('[data-command="right"]');
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="retry"]', { timeout: 8000 });
  await clickRetry(page);
  await page.waitForTimeout(300);
  await check('play: 失敗→ためしなおすでは出ない', () => cueCount(page), 0);

  // クリア → ためしなおす（replay）
  await page.click('[data-command="right"]');
  await page.click('[data-command="right"]');
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="replay"]', { timeout: 15000 });
  await page.click('[data-action="replay"]');
  await page.waitForSelector('[data-action="run"]');
  await page.waitForTimeout(300);
  await check('play: クリア→ためしなおすでは出ない', () => cueCount(page), 0);

  // --- seesaw（次のステージでも開始時に出る） ---
  await enterPlay(page, 'teko-01-tsuriai');
  await checkStartThenGone(page, check, 'seesaw');

  await page.click('[data-action="run"]'); // 動かさずに実行 → 傾いて失敗
  await page.waitForSelector('[data-action="retry"]', { timeout: 10000 });
  await page.click('[data-action="retry"]');
  await page.waitForSelector('[data-action="run"]');
  await page.waitForTimeout(300);
  await check('seesaw: 失敗→ためしなおすでは出ない', () => cueCount(page), 0);

  await page.click('[data-action="pos-right"]');
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="replay"]', { timeout: 10000 });
  await page.click('[data-action="replay"]');
  await page.waitForSelector('[data-action="run"]');
  await page.waitForTimeout(300);
  await check('seesaw: クリア→ためしなおすでは出ない', () => cueCount(page), 0);

  // 次のステージでも開始時に出る
  await page.click('[data-action="pos-right"]');
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="next-stage"]', { timeout: 10000 });
  await page.click('[data-action="next-stage"]');
  await page.waitForSelector('[data-action="pos-right"]');
  await check('seesaw: 次のステージでも開始時に出る', () => cueCount(page), 1);

  await runDismiss({ page, check });
}

// --- 最初の盤面操作で「スタート！」が消える（Issue #635 段A）。開始直後（2秒以内）に操作する ---
const cueGone = (page) => page.waitForFunction(() => !document.querySelector('[data-start-cue]'), null, { timeout: 1500 });

async function checkDismissed(page, check, label) {
  await cueGone(page);
  await check(`${label}: 操作で「スタート！」が消える`, () => cueCount(page), 0);
  await check(`${label}: 消えたら data-start-cue も外れる`, () => cueFlag(page), false);
  await page.waitForFunction(() => {
    const b = document.querySelector('[data-sk-bird="bubble"]');
    return b && !b.hidden && b.dataset.question === 'true';
  }, null, { timeout: 1500 });
  await check(`${label}: 消えたあと問い文の吹き出しが出る`, () => bubbleShown(page), true);
}

async function runDismiss({ page, check }) {
  // play：命令ボタン1つ
  await enterPlay(page, 'start-cue-smoke');
  await check('play: 開始直後に出ている', () => cueCount(page), 1);
  await page.click('[data-command="right"]');
  await checkDismissed(page, check, 'play(命令ボタン)');

  // play：⚙ のタップでは消えない
  await enterPlay(page, 'start-cue-smoke');
  await page.click('[data-action="menu"]');
  await check('play: ⚙のタップでは消えない', () => cueFlag(page), true);

  // play：矢印キー・盤面ドラッグ
  await enterPlay(page, 'start-cue-smoke');
  await page.keyboard.press('ArrowRight');
  await checkDismissed(page, check, 'play(矢印キー)');

  // 命令0個の開始直後は run・removeLast が disabled で、js/ui-keys.js の registerKeys は何もしない（操作にならない）。
  // 2秒タイマーの自然消滅と区別できるよう、前提確認・keydown送信・結果読みを同一 evaluate で行う（待たない）。
  for (const key of ['Enter', 'Backspace']) {
    await enterPlay(page, 'start-cue-smoke');
    const result = await page.evaluate((k) => {
      if (!document.querySelector('[data-start-cue]')) return 'no-precondition';
      document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
      return document.querySelector('[data-start-cue]') ? 'kept' : 'gone';
    }, key);
    await check(`play: 命令0個の${key}では消えない（${key === 'Enter' ? 'run' : 'removeLast'} が無効＝操作にならない）`, () => result, 'kept');
  }

  await enterPlay(page, 'start-cue-smoke');
  const box = await page.locator('[data-sk-screen="board"]').boundingBox();
  await page.mouse.move(box.x + 6, box.y + 6);
  await page.mouse.down();
  await page.mouse.move(box.x + 30, box.y + 20, { steps: 3 });
  await page.mouse.up();
  await checkDismissed(page, check, 'play(盤面ドラッグ)');

  // seesaw：▶1回
  await enterPlay(page, 'teko-01-tsuriai');
  await check('seesaw: 開始直後に出ている', () => cueCount(page), 1);
  await page.click('[data-action="pos-right"]');
  await checkDismissed(page, check, 'seesaw(▶)');

}
