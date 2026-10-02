// 原則見直しレビュー（Issue #227）用のスクリーンショット撮影。--shot指定時のみ動く（無ければ即return）。
// 実行: gh workflow run e2e-run.yml --ref <ブランチ> -f scenarios="principles-shots --shot"
// 出力: .verify/principles-shots-NN-<レッスン略称>-<局面>.png（番号は difficulty.md の単元順＝遊ぶ順）
//   l1=cmd-01-susumu／l2=ice-01-suberu／l3=key-01-kagi／l4=switch-01-suicchi／l5=teko-01-tsuriai
// 直リンク（?lesson=）で入るため、スロット・名前入力画面は通らない。
import { clickRetry } from '../helpers.mjs';

export const name = 'principles-shots: 原則見直し用の画面キャプチャ14枚（--shot指定時のみ。Issue #227）';

const stepOf = (page) => page.getAttribute('#stage', 'data-step');
const solutionOf = (page, id) =>
  page.evaluate((lessonId) => fetch(`./lessons/${lessonId}.json`).then((r) => r.json())
    .then((l) => l.steps.find((s) => s.kind === 'play').solution), id);

// はじめに画面（デモが動き出した直後）
async function shotStart(page, shot, label, lessonId) {
  await page.goto(`/index.html?lesson=${lessonId}`);
  await page.waitForSelector('[data-action="start"]');
  await page.waitForTimeout(1500);
  await shot(label);
}

// tutorialのあるgrid-runtime：はじめる→tutorial冒頭→スキップ→p1で誤答→もういちど→正解でクリア
async function shotGridLesson(page, check, shot, n, tag, lessonId, wrongCommand) {
  await shotStart(page, shot, `${n}-${tag}-start`, lessonId);
  await page.click('[data-action="how-to"]');
  await check(`${lessonId}: そうさほうほうでtutorialに入る（Issue #236）`, () => stepOf(page), 'tutorial');
  await shot(`${String(Number(n) + 1).padStart(2, '0')}-${tag}-first-op`);

  await page.click('[data-action="skip-tutorial"]');
  await page.waitForFunction(() => document.querySelector('#stage')?.dataset.step === 'play');
  await page.click(`[data-command="${wrongCommand}"]`);
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="retry"]', { timeout: 15000 });
  await page.waitForSelector('[data-hint]');
  await shot(`${String(Number(n) + 2).padStart(2, '0')}-${tag}-first-fail`);

  await clickRetry(page);
  for (const c of await solutionOf(page, lessonId)) await page.click(`[data-command="${c}"]`);
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-result="clear"]', { timeout: 15000 });
  await page.waitForTimeout(500);
  await shot(`${String(Number(n) + 3).padStart(2, '0')}-${tag}-clear`);
}

export default async function run({ page, check, shot }) {
  if (!process.argv.includes('--shot')) return;

  await page.setViewportSize({ width: 1000, height: 625 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  // config.mjsが凍結fixture（tutorialなし）へ差し替えているため、現行JSONを使う
  await page.unroute('**/lessons/cmd-01-susumu.json');

  // 01-04 cmd-01：現行構造（intro→tutorial→p1〜p3→summary）で撮れていることを1枚目の時点で確認
  await page.goto('/index.html?lesson=cmd-01-susumu');
  await page.waitForSelector('[data-action="start"]');
  await check('cmd-01: introのステップドットが5個（intro/p1/p2/p3/summary。tutorialの点は中だけ。Issue #236）',
    async () => (await page.$$('.step-dot')).length, 5);
  await shotGridLesson(page, check, shot, '01', 'l1', 'cmd-01-susumu', 'up');

  // 05-08 ice-01
  await shotGridLesson(page, check, shot, '05', 'l2', 'ice-01-suberu', 'right');

  // 09-10 key-01・switch-01：はじめにのみ
  await shotStart(page, shot, '09-l3-start', 'key-01-kagi');
  await shotStart(page, shot, '10-l4-start', 'switch-01-suicchi');

  // 11-14 teko-01（predict-slider。tutorialなし）
  await shotStart(page, shot, '11-l5-start', 'teko-01-tsuriai');
  await page.click('[data-action="start"]');
  await page.waitForSelector('[data-action="pos-right"]');
  await page.click('[data-action="pos-right"]');
  await shot('12-l5-first-op');
  await page.click('[data-action="pos-left"]');
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="retry"]', { timeout: 10000 });
  await page.waitForSelector('[data-hint="tilt"]');
  await shot('13-l5-first-fail');
  await page.click('[data-action="retry"]');
  await page.waitForSelector('[data-action="run"]');
  await page.click('[data-action="pos-right"]');
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-result="clear"]', { timeout: 10000 });
  await page.waitForTimeout(500);
  await shot('14-l5-clear');
}
