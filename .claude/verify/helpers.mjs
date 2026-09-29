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
  for (const c of commands) {
    if (typeof c === 'string') {
      await page.click(`[data-command="${c}"]`);
      continue;
    }
    // くりかえしの箱{box, times}：はこ→方向→回数(2から1タップずつ)→とじる（Issue #66）。
    await page.click('[data-action="box-open"]');
    for (const d of c.box) await page.click(`[data-command="${d}"]`);
    for (let t = 2; t < c.times; t += 1) await page.click('[data-action="box-times"]');
    await page.click('[data-action="box-close"]');
  }
  await page.click('[data-action="run"]');
  // 1手0.6秒のため、命令が多いステージ(最大16個)でも間に合う余裕を持たせる。
  await page.waitForSelector(NEXT_SEL, { timeout: 15000 });
  await page.click(NEXT_SEL);
}

// 失敗後の「もういちど」を押し、画面暗転（[data-transition="retry"]。Issue #136）が明けるまで待つ。
export async function clickRetry(page) {
  await page.click('[data-action="retry"]');
  await page.waitForFunction(() => !document.querySelector('[data-transition="retry"]'), null, { timeout: 4000 });
}

// レッスンJSON（solutionを持つplayステージ）を、ページが実際に読むのと同じ経路（fetch。
// page.routeの差し替えも効く）で取得する。
async function fetchLesson(page, lessonId) {
  return page.evaluate((id) => fetch(`./lessons/${id}.json`).then((r) => r.json()), lessonId);
}

// インラインのレッスンJSONをlessons/<lessonId>.jsonとして返すようroute登録する。ギミックのシナリオは
// 実レッスンに依存しない最小盤面で書く（レッスン改訂で壊れない。page.goto前に呼ぶ）。
export async function routeLesson(page, lessonObj) {
  await page.route(`**/lessons/${lessonObj.lessonId}.json`, (route) => route.fulfill({ json: lessonObj }));
}

// レッスンを最初から最後までクリアし、まとめ（summary）画面で止まる。各playステージのsolution
// （docs/lesson-schema.md）を使う。{ removeIndex }はなおす系で、そのチップを消してから
// commandsを積む。凍結fixture経由（predict構成）でもJSONの内容に従う。
export async function clearLesson(page, lessonId) {
  await enterPlay(page, lessonId);
  const lesson = await fetchLesson(page, lessonId);
  const plays = lesson.steps.filter((s) => s.kind === 'play');
  for (const play of plays) {
    if (play.solution === undefined) throw new Error(`clearLesson: ${lessonId}/${play.stepId} にsolutionが無い`);
    const sol = Array.isArray(play.solution) ? { commands: play.solution } : play.solution;
    if (sol.removeIndex !== undefined) await page.click(`[data-remove-index="${sol.removeIndex}"]`);
    await clearStage(page, sol.commands ?? []);
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
