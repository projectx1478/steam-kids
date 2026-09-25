export const name = 'A1 効果音: groupRepeatsでtap→stack、方向が変わるとtapに戻る';

async function countSfx(page, name) {
  return page.evaluate((n) => window.__sfxLog.filter((x) => x === n).length, name);
}

export default async function run({ page, check }) {
  await page.goto('/index.html?lesson=cmd-02-mijikaku');
  await page.click('[data-action="start"]');
  await page.click('[data-option="A"]');
  await page.waitForSelector('[data-action="next"]', { timeout: 4000 });
  await page.click('[data-action="next"]');
  await check('playステップに入る', async () => page.getAttribute('#stage', 'data-step'), 'play');

  for (let i = 0; i < 5; i++) await page.click('[data-command="down"]');
  await check('down×5の1回目はtap', async () => countSfx(page, 'tap'), 1);
  await check('down×5の2〜5回目はstack(4回)', async () => countSfx(page, 'stack'), 4);

  await page.click('[data-command="right"]');
  await page.click('[data-command="right"]');
  await check('方向が変わった1回目はtapで合計2回', async () => countSfx(page, 'tap'), 2);
  await check('同方向の2回目はstackで合計5回', async () => countSfx(page, 'stack'), 5);
}
