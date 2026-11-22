// R2（Issue #749）：「めいれいを よむ」を通常の単元マップから開き、3面クリアでスタンプが付く。
export const name = 'R2 めいれいを よむ: 単元マップから開き3面クリアでスタンプ(Issue #749)';

const SEL = '[data-lesson-id="cmd-08-yomu"]';

export default async function run({ page, check }) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/index.html?view=map');
  await check('通常の単元マップに cmd-08-yomu のボタンが1つある', async () => (await page.$$(SEL)).length, 1);

  const lesson = await page.evaluate(() => fetch('lessons/cmd-08-yomu.json').then((r) => r.json()));
  const index = await page.evaluate(() => fetch('lessons/index.json').then((r) => r.json()));
  const order = [];
  const walk = (o) => {
    if (Array.isArray(o)) o.forEach(walk);
    else if (o && typeof o === 'object') {
      if (o.unitId) order.push(...o.lessonIds);
      else Object.values(o).forEach(walk);
    }
  };
  walk(index);
  const before = order.slice(0, order.indexOf('cmd-08-yomu'));
  await page.evaluate(
    (list) =>
      localStorage.setItem(
        'steamkids.events',
        JSON.stringify(list.map((lessonId, i) => ({ eventId: `e${i}`, learnerId: 'l', lessonId, stepId: 'p3', type: 'clear', ts: Date.now(), payload: {} })))
      ),
    before
  );
  await page.goto('/index.html?view=map');
  await check('ice-02-kabe までクリア後は錠が外れる', () => page.$eval(SEL, (b) => !b.dataset.locked), true);

  await page.click(SEL);
  await page.waitForSelector('#stage[data-step="intro"]');
  await page.click('[data-action="start"]');

  const plays = lesson.steps.filter((s) => s.read);
  for (let i = 0; i < plays.length; i++) {
    const { x, y } = plays[i].goal;
    await page.waitForSelector('[data-read-board]');
    await page.waitForTimeout(2600);
    await page.click(`[data-read-board] .grid-cell[data-x="${x}"][data-y="${y}"]`);
    await page.click('[data-action="run"]');
    if (i < plays.length - 1) {
      await page.waitForSelector('[data-action="next-stage"]', { timeout: 20000 });
      await page.click('[data-action="next-stage"]');
    } else {
      await page.waitForSelector('[data-action="next"]', { timeout: 20000 });
      await page.click('[data-action="next"]');
      await page.waitForTimeout(1500);
    }
  }

  await page.goto('/index.html?view=map');
  await check('3面クリア後、cmd-08-yomu にスタンプが1つ付く', async () => (await page.$$(`${SEL} ~ .lesson-stamp`)).length, 1);
}
