// C13 失敗後の列: ためしなおすで命令列が残り、違った1個だけ直して再実行できる。強調は最初に外れた1個だけ（Issue #545 段2）。
// 4個で失敗→ためしなおす→違った1個を消す→1個差し込む（ドラッグ）→じっこう＝4操作。

export const name = 'C13 失敗後の列: ためしなおすで列が残る・4操作で直せる・強調は最初に外れた1個だけ・直すと外れる(Issue #545)';
import { routeLesson, enterPlay, clickRetryKeep } from '../helpers.mjs';

const lesson = {
  lessonId: 'c13-keep-after-fail',
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
      grid: { cols: 5, rows: 1 },
      start: { x: 0, y: 0 },
      goal: { x: 4, y: 0 },
      walls: [],
      allowedCommands: ['left', 'right'],
      solution: ['right', 'right', 'right', 'right'],
      maxCommands: 6,
    },
    { stepId: 's2', kind: 'summary', text: 'できたね' },
  ],
};

const queue = (page) => page.$$eval('.command-chip', (els) => els.map((e) => e.textContent.trim()));

// パレットの dir ボタンをドラッグし、最後のチップの右側で離す（末尾の隙間）。
async function dragToEnd(page, dir) {
  const btn = await page.locator(`[data-command="${dir}"]`).boundingBox();
  const chips = await page.$$('.command-chip');
  const b = await chips[chips.length - 1].boundingBox();
  await page.mouse.move(btn.x + btn.width / 2, btn.y + btn.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width - 4, b.y + b.height / 2, { steps: 12 });
  await page.mouse.up();
}

export default async function run({ page, check }) {
  await page.setViewportSize({ width: 360, height: 640 });
  await routeLesson(page, lesson);
  await enterPlay(page, 'c13-keep-after-fail');

  // --- 4個で失敗（right,right,left,right は x=2 で止まる）→ 列が残る ---
  for (const c of ['right', 'right', 'left', 'right']) await page.click(`[data-command="${c}"]`);
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="retry"]', { timeout: 8000 });
  let ops = 0;
  await clickRetryKeep(page);
  ops += 1; // ためしなおす
  await check('ためしなおすで列が4個残る', () => queue(page), ['みぎ', 'みぎ', 'ひだり', 'みぎ']);
  await check('ためしなおすでロックが解ける（命令パレットが押せる）', () => page.$eval('[data-command="right"]', (b) => b.disabled), false);
  await check('ためしなおす直後の約0.5秒は じっこう が押せない', () => page.$eval('[data-action="run"]', (b) => b.disabled), true);

  await page.click('[data-remove-index="2"]'); // 違った1個（ひだり）を消す
  ops += 1;
  await check('違った1個だけ消えて3個になる', () => queue(page), ['みぎ', 'みぎ', 'みぎ']);
  await dragToEnd(page, 'right'); // 1個差し込む（ドラッグ1操作）
  ops += 1;
  await check('ドラッグで1個差し込まれて4個になる', () => queue(page), ['みぎ', 'みぎ', 'みぎ', 'みぎ']);
  await page.click('[data-action="run"]'); // 0.5秒たてば押せる（自動待ち）
  ops += 1;
  await page.waitForSelector('[data-action="next"]', { timeout: 8000 });
  await check('直して再実行でクリアできる', async () => (await page.$$('[data-action="next"]')).length, 1);
  await check('失敗後の再実行は4操作以内（ためしなおす・消す・差し込む・じっこう）', async () => ops <= 4, true);

  // --- 3個以上で失敗：強調は最初に外れた命令の1個だけ ---
  await enterPlay(page, 'c13-keep-after-fail');
  for (const c of ['right', 'left', 'left', 'left']) await page.click(`[data-command="${c}"]`);
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="retry"]', { timeout: 8000 });
  await check('壁（盤外）で失敗：強調の枠は1個だけ', async () => (await page.$$('.command-chip.sk-cmd-fail')).length, 1);
  await check('強調は最初に外れた命令（3番目＝添字2）', () => page.$eval('.command-chip.sk-cmd-fail', (e) => e.dataset.index), '2');
  await check('従来の黄色リングも付いている（1個）', async () => (await page.$$('.command-chip.ring-amber-400')).length, 1);

  await clickRetryKeep(page);
  await check('ためしなおす後も列は4個で強調が残る', async () => [(await page.$$('.command-chip')).length, (await page.$$('.command-chip.sk-cmd-fail')).length], [4, 1]);
  await page.click('[data-action="remove-last"]');
  await check('列を直すと強調は外れる', async () => (await page.$$('.command-chip.sk-cmd-fail')).length, 0);
}
