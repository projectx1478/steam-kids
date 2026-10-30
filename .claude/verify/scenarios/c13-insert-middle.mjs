// C13 差し込み: ドラッグは最も近い隙間（先頭・途中・末尾）へ入る。ドラッグ中は縦線の目印が1本出る。
// 上限（maxCommands）に達していても入る（#615）。タップは末尾追加のまま（Issue #545 段1）。

export const name = 'C13 差し込み: 途中・先頭へ入り順序が変わる・縦線の目印・上限でも入る(Issue #545)';
import { enterPlay } from '../helpers.mjs';

const queue = (page) => page.$$eval('.command-chip', (els) => els.map((e) => e.textContent.trim()));

// パレットの dir ボタンをドラッグし、chip[i] の左端（edge='left'）または最後のチップの右側（'right'）で離す。
async function dragTo(page, dir, i, edge, hold = false) {
  const btn = await page.locator(`[data-command="${dir}"]`).boundingBox();
  const chips = await page.$$('.command-chip');
  const b = await chips[i].boundingBox();
  const x = edge === 'left' ? b.x + 4 : b.x + b.width - 4;
  const y = b.y + b.height / 2;
  await page.mouse.move(btn.x + btn.width / 2, btn.y + btn.height / 2);
  await page.mouse.down();
  await page.mouse.move(x, y, { steps: 12 });
  if (hold) return;
  await page.mouse.up();
}

export default async function run({ page, check }) {
  await page.unroute('**/lessons/cmd-01-susumu.json');
  await page.setViewportSize({ width: 1024, height: 768 });
  await enterPlay(page, 'cmd-01-susumu');

  for (const c of ['up', 'right', 'down']) await page.click(`[data-command="${c}"]`);
  await check('タップは末尾に追加される', () => queue(page), ['うえ', 'みぎ', 'した']);

  // 途中：うえ と みぎ の間へ ひだり
  await dragTo(page, 'left', 1, 'left', true);
  await check('ドラッグ中、縦線の目印が1本出る', async () => (await page.$$('.command-queue > .ghost-slot.ghost-line')).length, 1);
  await check('ドラッグ中の目印は命令列直下に1つだけ', async () => (await page.$$('.command-queue > .ghost-slot')).length, 1);
  await page.mouse.up();
  await check('途中の隙間へ差し込まれ順序が変わる', () => queue(page), ['うえ', 'ひだり', 'みぎ', 'した']);
  await check('離すと縦線が消える', async () => (await page.$$('.command-queue > .ghost-slot')).length, 0);

  // 先頭
  await dragTo(page, 'down', 0, 'left');
  await check('先頭へ差し込める', () => queue(page), ['した', 'うえ', 'ひだり', 'みぎ', 'した']);

  // 末尾（最後のチップの右側）
  await dragTo(page, 'up', 4, 'right');
  await check('末尾の隙間へも入る', () => queue(page), ['した', 'うえ', 'ひだり', 'みぎ', 'した', 'うえ']);

  // 6個（旧上限）：次の枠は出続け（中身は空）、途中へドラッグしても入る（#615 で上限なし）
  await check('6個でも次の枠が1つ出る', async () => (await page.$$('.tray-slot')).length, 1);
  await check('2つ目以降の空き枠は数字を出さない', async () => (await page.$eval('.tray-slot', (e) => e.textContent.trim())), '');
  await dragTo(page, 'left', 1, 'left');
  await check('上限でも途中へ差し込める', () => queue(page), ['した', 'ひだり', 'うえ', 'ひだり', 'みぎ', 'した', 'うえ']);
}
