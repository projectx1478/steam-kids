// C2d 実機フィードバック: 画面に収まるレイアウト・ゴースト矢印・順序表示（Issue #93）。
// 課題カードはIssue #97で廃止し、playは即座に操作画面へ入る（begin-task/show-taskは
// 存在しない）。よそう（predict）はIssue #104で全廃した。

export const name = 'C5 レイアウト・ゴースト矢印: 画面に収まる・重ならない・順序が分かる(Issue #93/#97/#104)';

const VIEWPORTS = [
  { width: 375, height: 667 },
  { width: 360, height: 640 },
  { width: 768, height: 1024 },
  { width: 1280, height: 800 },
];

function overlaps(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

async function noScrollX(page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
}
async function noScrollY(page) {
  return page.evaluate(() => document.documentElement.scrollHeight <= document.documentElement.clientHeight + 1);
}

async function checkFitsAndNonOverlap(page, check, label, viewport) {
  await check(`${label}: 横スクロール無し`, async () => noScrollX(page));
  await check(`${label}: 縦スクロール無し`, async () => noScrollY(page));

  const cells = await page.$$('.grid-cell');
  await check(`${label}: 盤面マスが1マスでも存在する`, () => cells.length > 0);
  for (const el of cells) {
    const box = await el.boundingBox();
    if (!box) continue;
    await check(
      `${label}: 盤面マスが画面内`,
      () => box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width && box.y + box.height <= viewport.height
    );
  }

  const runBtn = await page.$('[data-action="run"], [data-action="retry"]');
  if (runBtn) {
    const box = await runBtn.boundingBox();
    await check(`${label}: じっこうボタンが画面内`, () => box.y + box.height <= viewport.height);
    await check(`${label}: じっこうボタンが48px以上`, () => box.width >= 48 && box.height >= 48);
  }

  // 盤面と操作系（パレット・命令列・じっこう）が互いに重ならない
  const boardBox = await page.locator('.grid-board').boundingBox();
  const controlBoxes = [];
  for (const el of await page.$$('.command-btn, .command-chip, [data-action="run"], [data-action="retry"]')) {
    const b = await el.boundingBox();
    if (b) controlBoxes.push(b);
  }
  for (const b of controlBoxes) {
    await check(`${label}: 盤面と操作ボタンが重ならない`, () => !overlaps(boardBox, b));
  }
}

export default async function run({ page, check }) {
  await page.unroute('**/lessons/cmd-01-susumu.json');
  await page.unroute('**/lessons/donguri-01-hirou.json');

  // --- playは即座に操作画面（課題カードは無い。Issue #97）。よそうは無い（Issue #104）。
  // tutorial(fix)はとばす（Issue #98） ---
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/index.html?lesson=cmd-03-naosu');
  await page.click('[data-action="start"]');
  await page.click('[data-action="skip-tutorial"]');
  await check('playへ即座に入る（課題カード・よそう無し）', async () => page.getAttribute('#stage', 'data-step'), 'play');
  await check('操作画面に区分見出しが無い', async () => (await page.$$('.play-screen h2')).length, 0);
  await check('操作画面にデモが無い', async () => (await page.$$('.play-screen .demo-widget')).length, 0);
  await check('操作画面にやりかた帯が無い', async () => (await page.$$('.play-screen .howto-strip')).length, 0);
  await check('play操作画面に説明要素(<p>)が問い文以外に無い', async () => (await page.$$('.play-screen > p, .play-screen h2')).length, 0);
  await check('play操作画面にデモが無い', async () => (await page.$$('.play-screen .demo-widget, .play-screen .category-banner')).length, 0);

  // --- 命令列に→区切りと順番数字（Issue #93）。cmd-02-mijikakuのtutorial(group)をとばした
  // play(p1)の空queueで確認する（Issue #98） ---
  await page.goto('/index.html?lesson=cmd-02-mijikaku');
  await page.click('[data-action="start"]');
  await page.click('[data-action="skip-tutorial"]');
  await check('playへ即座に入る', async () => page.getAttribute('#stage', 'data-step'), 'play');
  await page.click('[data-command="down"]');
  await page.click('[data-command="right"]');
  await check('命令列に→区切りがある', async () => (await page.$$('.command-arrow')).length, 1);
  await check('1個目のチップの順番は1', async () => page.getAttribute('.command-chip[data-index="0"]', 'data-order'), '1');
  await check('2個目のチップの順番は2', async () => page.getAttribute('.command-chip[data-index="1"]', 'data-order'), '2');

  // --- 4viewport × predict/play/tutorialで画面に収まる・重ならない・スクロール0 ---
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    const label = `${viewport.width}x${viewport.height}`;

    await page.goto('/index.html?lesson=cmd-01-susumu');
    // 各viewportでtutorialから確認するため、前のiterationで付いた完了フラグを毎回消す。
    await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('steamkids.tutorialDone.')).forEach((k) => localStorage.removeItem(k)));
    await page.click('[data-action="start"]');
    await check(`${label}: tutorialから始まる`, async () => page.getAttribute('#stage', 'data-step'), 'tutorial');
    // tutorial
    await checkFitsAndNonOverlap(page, check, `${label} tutorial`, viewport);
    for (const dir of ['up', 'up', 'right', 'right']) await page.click(`[data-command="${dir}"]`);
    await page.click('[data-action="run"]');
    await page.waitForSelector('[data-action="continue-to-task"]', { timeout: 8000 });
    await page.click('[data-action="continue-to-task"]');

    // play（即座に操作画面。よそうは無い。Issue #104）
    await check(`${label}: playへ即座に入る`, async () => page.getAttribute('#stage', 'data-step'), 'play');
    await checkFitsAndNonOverlap(page, check, `${label} play`, viewport);
  }
  await page.setViewportSize({ width: 1280, height: 800 });

  // --- チュートリアル: ゴースト矢印が番号順に増える・キャプション20字以内 ---
  await page.goto('/index.html?lesson=cmd-01-susumu');
  await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('steamkids.tutorialDone.')).forEach((k) => localStorage.removeItem(k)));
  await page.click('[data-action="start"]');
  await check('tutorialから始まる', async () => page.getAttribute('#stage', 'data-step'), 'tutorial');
  await page.click('[data-command="up"]');
  await check('1回目タップでゴースト①が出る', async () => page.getAttribute('.grid-marker-ghost', 'data-ghost-order'), '1');
  await check('キャプションは20字以内', async () => (await page.textContent('.ghost-caption')).length <= 20);
  await page.click('[data-command="up"]');
  await check('2回目タップでゴーストが2個になる', async () => (await page.$$('.grid-marker-ghost')).length, 2);
  await check('2個目のゴースト番号は2', async () => page.getAttribute('[data-ghost-order="2"]', 'data-ghost-order'), '2');

  // --- npm run validate:lessons相当のレッスン構造は変更していないことをJSONで確認 ---
  const stepIds = await page.evaluate(async () => {
    const res = await fetch('/lessons/cmd-01-susumu.json');
    const data = await res.json();
    return data.steps.map((s) => s.stepId);
  });
  await check('レッスンJSONのstepIdは不変（サブ画面はJSONを増やさない）', () => stepIds, ['s1', 't1', 'p1', 'p2', 'p3', 's2']);
}
