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
    return texts;
  });
  await check('times>=2は「した ×5」形式で表示', async () => labels[0], 'した ×5');
  await check('times=1はまとめ表示を付けない', async () => labels[1], 'うえ');
}
