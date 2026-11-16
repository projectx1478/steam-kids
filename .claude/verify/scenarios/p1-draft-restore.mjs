// 置き方の下書き（Issue #745）：grid以外5型（seesaw・buoyancy・sortorder・unfold・egg）の置き方は、
// 再読込しても復元される。「ぜんぶけす」とクリアで消え、dev=1 では保存されない。grid の命令列も再読込で残る。
import { enterPlay } from '../helpers.mjs';

export const name = 'P1 置き方の下書き: 5型で再読込復元・ぜんぶけす/クリアで消去・dev=1は保存なし・gridも復元(Issue #745)';

const placeKey = (id) => `steamkids.place.${id}`;
const readPlace = (page, id) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? 'null'), placeKey(id));
const placeKeyCount = (page) => page.evaluate(() => Object.keys(localStorage).filter((k) => k.includes('place.')).length);

export default async function run({ page, check }) {
  await page.setViewportSize({ width: 360, height: 640 });

  // --- grid（cmd-01-susumu p1）：3手 → 再読込 → 3手残る ---
  await enterPlay(page, 'cmd-01-susumu');
  for (const c of ['right', 'right', 'right']) await page.click(`[data-command="${c}"]`);
  await check('grid: 3手置く', async () => (await page.$$('.command-chip')).length, 3);
  await enterPlay(page, 'cmd-01-susumu');
  await check('grid: 再読込で3手残る', async () => (await page.$$('.command-chip')).length, 3);

  // --- seesaw（teko-01-tsuriai p1）：▶で位置が動く → 再読込で同じ位置 → クリアで消える ---
  await enterPlay(page, 'teko-01-tsuriai');
  await page.click('[data-action="pos-right"]');
  await check('seesaw: ▶で位置2', () => page.getAttribute('[data-mover]', 'data-pos'), '2');
  await check('seesaw: 保存はtype=seesaw', async () => (await readPlace(page, 'teko-01-tsuriai'))?.type, 'seesaw');
  await enterPlay(page, 'teko-01-tsuriai');
  await check('seesaw: 再読込で位置2のまま', () => page.getAttribute('[data-mover]', 'data-pos'), '2');
  await page.click('[data-action="run"]');
  await page.waitForFunction((k) => localStorage.getItem(k) === null, placeKey('teko-01-tsuriai'), { timeout: 10000 });
  await check('seesaw: クリアで保存が消える', () => readPlace(page, 'teko-01-tsuriai'), null);
  await enterPlay(page, 'teko-01-tsuriai');
  await check('seesaw: クリア後に開くと初期位置1', () => page.getAttribute('[data-mover]', 'data-pos'), '1');

  // --- buoyancy（teko-07-ukabu p1）：道具を付ける → 再読込で付いたまま ---
  await enterPlay(page, 'teko-07-ukabu');
  await page.click('[data-action="tool-w1"]');
  await check('buoyancy: 道具w1が付く', () => page.getAttribute('[data-action="tool-w1"]', 'aria-pressed'), 'true');
  await enterPlay(page, 'teko-07-ukabu');
  await check('buoyancy: 再読込で道具w1が付いたまま', () => page.getAttribute('[data-action="tool-w1"]', 'aria-pressed'), 'true');

  // --- sortorder（sort-01-recipe p1）：2枚置く → 再読込で残る → やりなおすで消える ---
  const slotIds = (p) => p.$$eval('[data-so-slots] .so-slot', (els) => els.map((e) => e.dataset.cardId ?? null));
  await enterPlay(page, 'sort-01-recipe');
  await page.click('[data-so-tray] [data-card-id="sara"]');
  await page.click('[data-so-tray] [data-card-id="wa"]');
  await check('sort: 2枚置く', () => slotIds(page), ['sara', 'wa', null]);
  await enterPlay(page, 'sort-01-recipe');
  await check('sort: 再読込で2枚残る', () => slotIds(page), ['sara', 'wa', null]);
  await page.click('[data-action="reset"]');
  await check('sort: やりなおすで保存が消える', () => readPlace(page, 'sort-01-recipe'), null);
  await enterPlay(page, 'sort-01-recipe');
  await check('sort: 消した後は空で始まる', () => slotIds(page), [null, null, null]);

  // --- unfold（unfold-01-cube p1）：1マス塗る → 再読込で残る → ぜんぶけすで消える ---
  const openUnfold = async () => {
    await page.goto('/index.html?lesson=unfold-01-cube');
    await page.waitForSelector('[data-action="start"]');
    await page.click('[data-action="start"]');
    await page.waitForSelector('[data-unfold-grid]');
  };
  await openUnfold();
  const target = await page.$eval('.uf-cell:not(.uf-pre)', (e) => ({ x: e.dataset.x, y: e.dataset.y }));
  const cellSel = `.uf-cell[data-x="${target.x}"][data-y="${target.y}"]`;
  await page.click(cellSel);
  await check('unfold: 1マス塗る', async () => (await page.getAttribute(cellSel, 'class')).includes('uf-paint'), true);
  await openUnfold();
  await check('unfold: 再読込で塗ったマスが残る', async () => (await page.getAttribute(cellSel, 'class')).includes('uf-paint'), true);
  await page.click('[data-action="reset"]');
  await check('unfold: ぜんぶけすで保存が消える', () => readPlace(page, 'unfold-01-cube'), null);
  await openUnfold();
  await check('unfold: 消した後は塗りなしで始まる', async () => (await page.$$('.uf-cell.uf-paint')).length, 0);

  // --- egg（egg-01-michi p1）：板を1枚置く → 再読込で残る ---
  const openEgg = async () => {
    await page.goto('/index.html?lesson=egg-01-michi');
    await page.waitForSelector('[data-action="start"]');
    await page.click('[data-action="start"]');
    await page.waitForSelector('[data-egg-grid]');
  };
  await openEgg();
  await page.click('.egg-cell.egg-place');
  await check('egg: 板が1枚置かれる', async () => (await page.$$('.egg-plate')).length, 1);
  await openEgg();
  await check('egg: 再読込で板が1枚残る', async () => (await page.$$('.egg-plate')).length, 1);

  // --- dev=1：保存しない ---
  await page.evaluate(() => Object.keys(localStorage).filter((k) => k.includes('place.')).forEach((k) => localStorage.removeItem(k)));
  await page.goto('/index.html?lesson=sort-01-recipe&dev=1');
  await page.waitForSelector('[data-action="start"]');
  await page.click('[data-action="start"]');
  await page.waitForSelector('[data-so-tray]');
  await page.click('[data-so-tray] [data-card-id="sara"]');
  await check('dev=1: 置いても place. キーが増えない', () => placeKeyCount(page), 0);
}
