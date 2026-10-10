// 低背の横向き 1024×600 で、play 画面の操作ボタン行（2×2）が #stage に収まり縦スクロールが出ないこと（Issue #370）。
// 操作ボタン行は高さ480〜700pxの横向きで2×2（136px）。入りきらず状態ごとにスクロール量が変わるのを防ぐため、
// 次の4状態すべてで #stage の scrollHeight <= clientHeight を見る（実測: ボタン行は4状態とも136pxで、
// 最も高いのは4つ目のボタンが「↺ もういちど」になる失敗後）。
//   ①命令トレイ空 ②命令を積んだ状態 ③クリア後の「間」（[data-result-gap]） ④失敗後（もういちど）

export const name = 'C11 1024×600: 操作ボタン行が#stageに収まる4状態(Issue #370)';
import { enterPlay } from '../helpers.mjs';

export default async function run({ page, check }) {
  await page.unroute('**/lessons/cmd-01-susumu.json');
  await page.setViewportSize({ width: 1024, height: 600 });
  const fits = () => page.evaluate(() => {
    const s = document.querySelector('#stage');
    return s.scrollHeight <= s.clientHeight;
  });
  const actionsHeight = async () => Math.round((await (await page.$('[data-sk-screen="actions"]')).boundingBox()).height);

  await enterPlay(page, 'cmd-01-susumu');
  await check('①命令トレイ空: #stage に収まる', fits, true);
  await check('①命令トレイ空: 操作ボタン行は2×2の136px', actionsHeight, 136);

  for (const dir of ['up', 'up', 'left', 'left']) await page.click(`[data-command="${dir}"]`);
  await check('②命令を積んだ状態: #stage に収まる', fits, true);

  for (let i = 0; i < 10 && (await page.$('[data-action="step"]')); i += 1) await page.click('[data-action="step"]');
  await page.waitForSelector('[data-result-gap]');
  await check('③クリア後の間: #stage に収まる', fits, true);
  await page.waitForSelector('[data-action="next-stage"]', { timeout: 4000 });

  // 失敗後（間違った手で実行 → 4つ目が「もういちど」）
  await enterPlay(page, 'cmd-01-susumu');
  for (const dir of ['down', 'down']) await page.click(`[data-command="${dir}"]`);
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="retry"]', { timeout: 8000 });
  await check('④失敗後(もういちど): #stage に収まる', fits, true);
  await check('④失敗後(もういちど): 操作ボタン行は136px', actionsHeight, 136);
}
