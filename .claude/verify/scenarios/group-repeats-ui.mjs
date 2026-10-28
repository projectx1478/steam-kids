export const name = 'ui-commands: まとめ命令({dir,times})のチップ表示(Issue #48。エンジン部分はtest/engine-group-repeats.test.mjs)';

import { enterPlay } from '../helpers.mjs';

export default async function run({ page, check }) {
  await page.goto('/index.html');

  const labels = await page.evaluate(async () => {
    const { renderCommandQueue } = await import('/js/ui-commands.js');
    const container = document.createElement('ul');
    document.body.appendChild(container);
    renderCommandQueue(container, {
      commands: [
        { dir: 'down', times: 5 },
        { dir: 'up', times: 1 },
      ],
      activeIndex: -1,
      onRemove: () => {},
    });
    const texts = [...container.querySelectorAll('.command-chip span')].map((el) => el.textContent);
    container.remove();
    // 箱（1チップ）を含む列でも、差し込みの隙間 index は列の添字で数える（箱の中身は数えない。#545）。
    const { computeGapIndex } = await import('/js/ui-commands.js');
    const list = document.createElement('ul');
    document.body.appendChild(list);
    renderCommandQueue(list, {
      commands: [
        { dir: 'down', times: 2 },
        { box: ['right', 'up'], times: 2 },
        { dir: 'up', times: 1 },
      ],
      activeIndex: -1,
      onRemove: () => {},
    });
    const rects = [...list.querySelectorAll(':scope > [data-index]')].map((el) => el.getBoundingClientRect());
    // 折り返して複数行になっても、各チップと同じ行の縦位置で測る。
    const midY = (r) => (r.top + r.bottom) / 2;
    const gaps = [
      computeGapIndex(list, rects[0].left + 1, midY(rects[0])),
      computeGapIndex(list, rects[1].left + 1, midY(rects[1])),
      computeGapIndex(list, rects[2].left + 1, midY(rects[2])),
      computeGapIndex(list, rects[2].right - 1, midY(rects[2])),
    ];
    list.remove();
    return { texts, gaps };
  });
  await check('times>=2は「した ×5」形式で表示', async () => labels.texts[0], 'した ×5');
  await check('times=1はまとめ表示を付けない', async () => labels.texts[1], 'うえ');
  await check('箱を含む列の差し込み隙間は列の添字（0・1・2・3）', async () => labels.gaps, [0, 1, 2, 3]);

  // キー操作（Issue #380）：箱が開いた状態で矢印を押すと、タップと同じく箱の中へ入る。
  await enterPlay(page, 'cmd-04-kurikaeshi');
  await page.click('[data-action="box-open"]');
  await page.keyboard.press('ArrowRight');
  await check('キー: 箱が開いた状態で矢印を押すと箱へ入る(チップは1個・箱の中1個)', async () =>
    [await page.$$eval('.command-chip', (e) => e.length), await page.$$eval('.command-chip [data-inner]', (e) => e.length)], [1, 1]);
}
