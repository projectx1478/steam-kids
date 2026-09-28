// .claude/verify/helpers.mjs（配布対象外・本リポジトリ固有。config.mjsと同じ扱い）
// シナリオ共通の「レッスンへ入る・クリアする」手順。シナリオからは
// `import { enterPlay } from '../helpers.mjs'` で使う。tutorial自体の検証（c2・c5・c6・c9）は
// このヘルパーを使わず、各シナリオで直接操作する。

const NEXT_SEL = '[data-action="next"], [data-action="next-stage"]';
const STEP_SEL = '#stage';

async function currentStep(page) {
  return page.getAttribute(STEP_SEL, 'data-step');
}

// 「はじめる」を押した後の状態（tutorial／predict／play）を待ち、playまで進める。
// 凍結fixture（cmd-01・donguri-01。config.mjs）はpredict経由、現行JSONはtutorial経由。
// 戻り値は最初に着いたステップ種別（'tutorial' | 'predict' | 'play'）。
async function settleToPlay(page) {
  await page.waitForFunction(
    (sel) => ['tutorial', 'predict', 'play'].includes(document.querySelector(sel)?.dataset.step),
    STEP_SEL
  );
  const first = await currentStep(page);
  if (first === 'tutorial') {
    await page.click('[data-action="skip-tutorial"]');
  } else if (first === 'predict') {
    await page.click('[data-option="B"]');
    await page.waitForSelector('[data-action="next"]', { timeout: 4000 });
    await page.click('[data-action="next"]');
  }
  await page.waitForFunction((sel) => document.querySelector(sel)?.dataset.step === 'play', STEP_SEL);
  return first;
}

export async function enterPlay(page, lessonId) {
  await page.goto(`/index.html?lesson=${lessonId}`);
  await page.click('[data-action="start"]');
  return settleToPlay(page);
}

// 現在のplayステージをcommandsで実行してクリアし、[data-action="next"]（最終）または
// [data-action="next-stage"]（途中）を押して次へ進む。commandsが空ならなおす系（初期列のまま実行）。
export async function clearStage(page, commands) {
  for (const c of commands) await page.click(`[data-command="${c}"]`);
  await page.click('[data-action="run"]');
  // 1手0.6秒のため、命令が多いステージ(最大16個)でも間に合う余裕を持たせる。
  await page.waitForSelector(NEXT_SEL, { timeout: 15000 });
  await page.click(NEXT_SEL);
}

// 各ステージの正解手順。{ commands } は命令を積んで実行、{ remove } はなおす系で
// 指定インデックスのチップを消してから実行する。
const STAGES = {
  'cmd-01-susumu': [
    { commands: ['up', 'up', 'left', 'left'] },
    { commands: ['up', 'up', 'up', 'right', 'right', 'right'] },
    { commands: ['up', 'up', 'right', 'right', 'right', 'right', 'up', 'up'] },
  ],
  'cmd-02-mijikaku': [
    { commands: ['down', 'down', 'down', 'left', 'left'] },
    { commands: ['down', 'down', 'down', 'down', 'down', 'right', 'right'] },
    { commands: ['right', 'right', 'down', 'down', 'down', 'down', 'right'] },
  ],
  'cmd-03-naosu': [{ remove: 1 }, { remove: 2 }, { remove: 6 }],
  'donguri-01-hirou': [
    { commands: ['right', 'right', 'up', 'up'] },
    { commands: ['right', 'right', 'right', 'up', 'up', 'up'] },
    { commands: ['right', 'right', 'right', 'right', 'up', 'up', 'up', 'up'] },
  ],
  'donguri-02-mawarimichi': [
    { commands: ['right', 'down', 'down', 'down', 'up', 'up', 'up', 'right'] },
    { commands: ['down', 'down', 'down', 'down', 'right', 'right', 'up', 'up', 'up', 'up', 'right'] },
    {
      commands: [
        'down', 'down', 'down', 'down', 'down',
        'right', 'right', 'right', 'right',
        'up', 'up', 'up', 'up', 'up',
      ],
    },
  ],
};

// 凍結fixture（predict＋play1ステージ構成）の正解手順。predict経由で入った時だけ使う。
const FROZEN_STAGES = {
  'cmd-01-susumu': [{ commands: ['up', 'up', 'up', 'right', 'right', 'right'] }],
  'donguri-01-hirou': [{ commands: ['right', 'right', 'right', 'up', 'up', 'up'] }],
};

// レッスンを最初から最後までクリアし、まとめ（summary）画面で止まる。
export async function clearLesson(page, lessonId) {
  const first = await enterPlay(page, lessonId);
  const stages = (first === 'predict' ? FROZEN_STAGES : STAGES)[lessonId];
  if (!stages) throw new Error(`clearLesson: 手順が未定義のレッスン ${lessonId}`);
  for (const stage of stages) {
    if (stage.remove !== undefined) await page.click(`[data-remove-index="${stage.remove}"]`);
    await clearStage(page, stage.commands ?? []);
  }
}

// tutorialの完了記録（steamkids.tutorialDone.<キー>）を全て消す。localStorageを触るため
// 事前に同一オリジンのページを開いておくこと。
export async function resetTutorialFlags(page) {
  await page.evaluate(() =>
    Object.keys(localStorage)
      .filter((k) => k.startsWith('steamkids.tutorialDone.'))
      .forEach((k) => localStorage.removeItem(k))
  );
}
