// 20×20（400マス）の drawBoard の所要ms・要素数を測る（Issue #389 段B。結果は docs/testing-steam-kids.md に記録）。
// 判定は余裕を見た上限のみ（CIの速さでぶれるため）。実測値は MEASURE 行に出す。
export const name = '20×20 の drawBoard の所要ms・要素数を測る(Issue #389)';

export default async function run({ page, check }) {
  await page.goto('/index.html');
  const m = await page.evaluate(async () => {
    const { drawBoard, fitCellSize } = await import('/js/ui-board.js');
    const holder = document.createElement('div');
    holder.style.cssText = 'position:fixed;left:0;top:0;width:328px;height:216px;overflow:hidden';
    document.body.appendChild(holder);
    const spec = {
      grid: { cols: 20, rows: 20 },
      start: { x: 0, y: 0 },
      goal: { x: 19, y: 19 },
      walls: Array.from({ length: 40 }, (_, i) => ({ x: (i * 7) % 20, y: 1 + ((i * 3) % 18) })),
      items: [],
    };
    const fit = fitCellSize({ spec, boardArea: holder });
    const times = [];
    for (let i = 0; i < 10; i += 1) {
      const t0 = performance.now();
      drawBoard({ boardWrap: holder, spec, ...fit, playerPos: spec.start });
      void holder.offsetWidth; // レイアウトまで含める
      times.push(performance.now() - t0);
    }
    return { fit, times, elements: holder.querySelectorAll('*').length, cells: holder.querySelectorAll('.grid-cell').length };
  });
  const sorted = [...m.times].sort((a, b) => a - b);
  console.log(`MEASURE 20x20 drawBoard: fit=${JSON.stringify(m.fit)} median=${sorted[5].toFixed(1)}ms max=${sorted[9].toFixed(1)}ms first=${m.times[0].toFixed(1)}ms elements=${m.elements} cells=${m.cells}`);
  await check('400マスを描く', () => m.cells, 400);
  await check('20×20 級はすき間1px・余白2pxで描く', () => `${m.fit.gap}/${m.fit.pad}`, '1/2');
  await check('描画の中央値が 500ms 未満', () => sorted[5] < 500, true);
}
