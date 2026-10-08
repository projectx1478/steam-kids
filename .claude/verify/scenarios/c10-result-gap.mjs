// クリア直後の「間」：1コマの連打が次のステージ・もういちどに当たらないこと、間のあとに結果ボタンが
// 1コマボタンと別の位置に出ること、間の最中の「← もどる」でタイマーが片付くこと（Issue #336）。

export const name = 'C10 クリア後の間: 1コマ連打が結果ボタンに当たらない・もどるで片付く(Issue #336)';
import { enterPlay } from '../helpers.mjs';

const inside = (a, b) => a.x >= b.x - 0.5 && a.y >= b.y - 0.5 && a.x + a.width <= b.x + b.width + 0.5 && a.y + a.height <= b.y + b.height + 0.5;

export default async function run({ page, check }) {
  await page.unroute('**/lessons/cmd-01-susumu.json');
  await page.setViewportSize({ width: 360, height: 640 });
  const stepId = () => page.getAttribute('#stage', 'data-step-id');
  const boardBox = async () => await (await page.$('[data-sk-screen="board"]')).boundingBox();
  const panelBox = async () => await (await page.$('[data-sk-screen="panel"]')).boundingBox();

  await enterPlay(page, 'cmd-01-susumu');
  const p1 = await stepId();
  for (const dir of ['up', 'up', 'left', 'left']) await page.click(`[data-command="${dir}"]`);
  const stepBox = await (await page.$('[data-action="step"]')).boundingBox();
  const boardBefore = await boardBox();
  const panelBefore = await panelBox();

  // 1コマで最後の手まで進める（最後のクリックで finishRun が走り、1コマボタンは消える）。
  for (let i = 0; i < 10 && (await page.$('[data-action="step"]')); i += 1) await page.click('[data-action="step"]');
  await check('クリア直後: 操作行が空き枠（…）になる', async () => (await page.$$('[data-result-gap]')).length, 1);
  await check('クリア直後: 結果ボタンはまだ出ない', async () => (await page.$$('[data-action="next-stage"], [data-action="replay"]')).length, 0);
  await check('間の最中: 盤面(data-sk-screen=board)の境界ボックスが変わらない', async () => await boardBox(), boardBefore);
  await check('間の最中: ダイアログは無い', async () => (await page.$$('[data-result-dialog]')).length, 0);

  // 1コマボタンがあった位置を連打する（間の最中。どこにも当たらない）。
  const cx = stepBox.x + stepBox.width / 2;
  const cy = stepBox.y + stepBox.height / 2;
  for (let i = 0; i < 6; i += 1) await page.mouse.click(cx, cy);
  await check('連打しても次のステージへ進まない', stepId, p1);

  await page.waitForSelector('[data-action="next-stage"]', { timeout: 4000 });
  await check('間のあと: つぎの ステージが出る', async () => (await page.$$('[data-action="next-stage"]')).length, 1);
  await check('間のあと: もういちどが出る', async () => (await page.$$('[data-action="replay"]')).length, 1);
  await check('間のあと: 「…」は消える', async () => (await page.$$('[data-result-gap]')).length, 0);
  const nextBox = await (await page.$('[data-action="next-stage"]')).boundingBox();
  const replayBox = await (await page.$('[data-action="replay"]')).boundingBox();
  await check('ダイアログがパネル(controls)の境界内に収まる', async () =>
    inside(await (await page.$('[data-result-dialog]')).boundingBox(), await (await page.$('[data-sk-screen="panel"]')).boundingBox())
  );
  await check('クリア前後で盤面(data-sk-screen=board)の境界ボックスが変わらない', async () => await boardBox(), boardBefore);
  await check('クリア前後でパネルの境界ボックスが変わらない', async () => await panelBox(), panelBefore);
  await page.waitForTimeout(3600); // 「やったね！」トーストが消えて問い文へ戻った後も
  await check('トースト消去後も盤面の境界ボックスが変わらない', async () => await boardBox(), boardBefore);
  await check('ダイアログ表示中: 背面のパレット・操作行・queue が inert', async () =>
    page.evaluate(() =>
      ['.palette-row', '.command-queue', '[data-sk-screen="actions"]'].every((s) => document.querySelector(s).closest('[inert]') !== null)
    )
  );
  await check('ダイアログ表示中: 「← もどる」は inert でない', async () =>
    page.evaluate(() => document.querySelector('#back-btn').closest('[inert]') === null)
  );
  await check('つぎの ステージの高さは64px', async () => Math.round(nextBox.height), 64);
  await check('もういちどの高さは64px・幅160px', async () => [Math.round(replayBox.height), Math.round(replayBox.width)], [64, 160]);
  await check('連打しても結果ボタンのもういちどは起動していない', stepId, p1);

  // --- 間の最中の「← もどる」：タイマーが片付き、結果ボタンが後から現れない ---
  await page.click('[data-action="replay"]');
  await page.waitForSelector('[data-action="step"]');
  for (const dir of ['up', 'up', 'left', 'left']) await page.click(`[data-command="${dir}"]`);
  await page.evaluate(() => localStorage.removeItem('steamkids.events'));
  for (let i = 0; i < 10 && (await page.$('[data-action="step"]')); i += 1) await page.click('[data-action="step"]');
  await page.waitForSelector('[data-result-gap]');
  await page.click('#back-btn');
  await check('もどる: playから出る', async () => (await page.getAttribute('#stage', 'data-step')) !== 'play');
  await page.waitForTimeout(2200);
  await check('もどる: 間のタイマーが片付き結果ボタンが現れない', async () => (await page.$$('[data-result-row]')).length, 0);
  await check(
    'もどる: stage_clear の記録は間の前に残っている',
    () =>
      page.evaluate(() =>
        JSON.parse(localStorage.getItem('steamkids.events') ?? '[]').filter((e) => e.type === 'stage_clear').length
      ),
    1
  );

  // --- reduced-motion: 間は1000ms（約0.5秒後はまだ「…」、約1.3秒後には結果行） ---
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enterPlay(page, 'cmd-01-susumu');
  for (const dir of ['up', 'up', 'left', 'left']) await page.click(`[data-command="${dir}"]`);
  for (let i = 0; i < 10 && (await page.$('[data-action="step"]')); i += 1) await page.click('[data-action="step"]');
  await page.waitForSelector('[data-result-gap]');
  await page.waitForTimeout(500);
  await check('reduced-motion 0.5秒後: 結果行はまだ無い', async () => (await page.$$('[data-result-row]')).length, 0);
  await check('reduced-motion 0.5秒後: 「…」がある', async () => (await page.$$('[data-result-gap]')).length, 1);
  await page.waitForTimeout(800);
  await check('reduced-motion 1.3秒後: 結果行が出ている', async () => (await page.$$('[data-result-row]')).length, 1);

  // --- 横向き（844×390）: 盤面の大きさが変わらず、ダイアログがパネルに収まる ---
  await page.setViewportSize({ width: 844, height: 390 });
  await enterPlay(page, 'cmd-01-susumu');
  for (const dir of ['up', 'up', 'left', 'left']) await page.click(`[data-command="${dir}"]`);
  const landBoardBefore = await boardBox();
  for (let i = 0; i < 10 && (await page.$('[data-action="step"]')); i += 1) await page.click('[data-action="step"]');
  await check('横向き: 間の最中: 盤面の境界ボックスが変わらない', async () => await boardBox(), landBoardBefore);
  await page.waitForSelector('[data-result-dialog]', { timeout: 4000 });
  await check('横向き: 盤面の境界ボックスが変わらない', async () => await boardBox(), landBoardBefore);
  await page.waitForTimeout(3600);
  await check('横向き: トースト消去後も盤面の境界ボックスが変わらない', async () => await boardBox(), landBoardBefore);
  await check('横向き: ダイアログがパネルの境界内に収まる', async () =>
    inside(await (await page.$('[data-result-dialog]')).boundingBox(), await panelBox())
  );
  await check('横向き: つぎの ステージの高さは64px以上', async () => (await (await page.$('[data-action="next-stage"]')).boundingBox()).height >= 64);
  await check('横向き: もういちどの高さは64px以上', async () => (await (await page.$('[data-action="replay"]')).boundingBox()).height >= 64);
}
