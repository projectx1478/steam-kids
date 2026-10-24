export const name = 'ui-commands: まとめ命令({dir,times})のチップ表示(Issue #48。エンジン部分はtest/engine-group-repeats.test.mjs)';

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
    const midY = (rects[0].top + rects[0].bottom) / 2;
    const gaps = [rects[0].left + 1, rects[1].left + 1, rects[2].left + 1, rects[2].right - 1].map((x) => computeGapIndex(list, x, midY));
    list.remove();
    return { texts, gaps };
  });
  await check('times>=2は「した ×5」形式で表示', async () => labels.texts[0], 'した ×5');
  await check('times=1はまとめ表示を付けない', async () => labels.texts[1], 'うえ');
  await check('箱を含む列の差し込み隙間は列の添字（0・1・2・3）', async () => labels.gaps, [0, 1, 2, 3]);
}
