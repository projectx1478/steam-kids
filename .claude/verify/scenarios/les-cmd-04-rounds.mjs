export const name = 'cmd-04: 箱の周回の点表示・data-round・roundOwner(壁・こおり・クッション)(Issue #167)';

// introデモの実行中に箱チップの周回が0→1→2と進み、点が塗りつぶされること、
// 実行外は点がすべて空でdata-roundが無いこと、ラベル「はこ ×N」が変わらないこと、
// engine-gridのroundOwnerが壁バンプ・こおり滑走・クッションでも周回を誤らないことを検証する。

export default async function run({ page, check }) {
  // --- engine: roundOwner（node経由でsimulateを直接呼ぶ。validate-lessons.mjsと同様にimport可） ---
  await page.goto('/index.html');
  const engine = await page.evaluate(async () => {
    const { simulate } = await import('/js/engine-grid.js');
    const base = { walls: [], items: [], ice: [], cushion: [] };
    const plain = simulate([{ box: ['right', 'down'], times: 3 }], {
      ...base, grid: { cols: 5, rows: 5 }, start: { x: 0, y: 0 }, goal: { x: 4, y: 4 },
    });
    const wall = simulate([{ box: ['right', 'up'], times: 2 }], {
      ...base, grid: { cols: 3, rows: 3 }, start: { x: 0, y: 1 }, goal: { x: 2, y: 0 }, walls: [{ x: 1, y: 1 }],
    });
    const ice = simulate([{ box: ['right', 'down'], times: 2 }], {
      ...base, grid: { cols: 5, rows: 5 }, start: { x: 0, y: 0 }, goal: { x: 4, y: 4 }, ice: [{ x: 1, y: 0 }, { x: 2, y: 0 }],
    });
    const cushion = simulate([{ box: ['right', 'down'], times: 2 }], {
      ...base, grid: { cols: 3, rows: 3 }, start: { x: 0, y: 0 }, goal: { x: 2, y: 2 }, cushion: [{ x: 1, y: 0 }],
    });
    const mixed = simulate(['right', { box: ['down'], times: 2 }], {
      ...base, grid: { cols: 5, rows: 5 }, start: { x: 0, y: 0 }, goal: { x: 4, y: 4 },
    });
    return {
      plainRound: plain.roundOwner, plainInner: plain.innerOwner,
      wallRound: wall.roundOwner, wallBlocked: wall.blockedAt,
      iceRound: ice.roundOwner, iceSlid: ice.slid,
      cushionRound: cushion.roundOwner, cushionBlocked: cushion.blockedAt,
      mixedRound: mixed.roundOwner,
    };
  });
  await check('roundOwner: 通常の箱[みぎ,した]×3は周0,0,1,1,2,2', async () => engine.plainRound, [0, 0, 1, 1, 2, 2]);
  await check('roundOwner: 壁に当たる手でも周がずれない', async () => engine.wallRound, [0, 0, 1, 1]);
  await check('roundOwner: 壁バンプはblockedAtに箱index', async () => engine.wallBlocked.length > 0, true);
  await check('roundOwner: こおり滑走(1手3マス)でも周がずれない', async () => engine.iceRound, [0, 0, 0, 0, 1, 1]);
  await check('roundOwner: クッションで止まる手でも周がずれない', async () => engine.cushionRound, [0, 0, 1, 1]);
  await check('roundOwner: クッションはblockedAtに入らない', async () => engine.cushionBlocked.length, 0);
  await check('roundOwner: 箱の外は-1・箱は周0,1', async () => engine.mixedRound, [-1, 0, 1]);

  // --- DOM: introデモの周回の点 ---
  // 実行前の「すべて空」状態はデモが描画と同時に実行を始めて観測できないため、
  // 編集状態(れんしゅう/play)での検証はles-cmd-04-repeat-boxに任せる。
  await page.goto('/index.html?lesson=cmd-04-kurikaeshi');
  await check('introデモの箱チップ: 点は3個', async () => page.$$eval('.box-rounds .box-round-dot', (e) => e.length), 3);
  await check('introデモの箱チップ: ラベルは「はこ ×3」', async () => page.textContent('.box-times'), 'はこ ×3');

  // デモは初回自動再生（よーい…1秒＋1手600ms）。周回0→1→2と進むのを追う。
  for (const [round, filled] of [['0', 1], ['1', 2], ['2', 3]]) {
    await page.waitForFunction(
      (r) => document.querySelector('.command-chip[data-box]')?.dataset.round === r,
      round,
      { timeout: 9000 }
    );
    await check(`実行中 周${round}: 塗りつぶされた点が${filled}個`, async () =>
      page.$$eval('.box-rounds .box-round-dot[data-filled]', (els) => els.length), filled);
    await check(`実行中 周${round}: ラベルは「はこ ×3」のまま`, async () => page.textContent('.box-times'), 'はこ ×3');
    await check(`実行中 周${round}: 現在の点だけ強調`, async () =>
      page.$$eval('.box-rounds .box-round-dot[data-current]', (els) => els.length), 1);
  }
  await check('周が進むごとにstack音が鳴る(2回以上)', async () =>
    page.evaluate(() => window.__sfxLog.filter((n) => n === 'stack').length >= 2), true);
}
