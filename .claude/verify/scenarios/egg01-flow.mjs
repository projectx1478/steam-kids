// egg-01（たまごの みち・build-egg。js/ui-egg.js = ui-egg）：面1で何も置かず失敗 → 板の向きを4回循環 → 正解でクリア → つぎへ → 面2の寸法(360x640・844x390) → 面8を solution で1回だけ通す(Issue #290)。
// 面3〜7 は通さない（E2E の本数と時間のため）。solution は lessons/egg-01-michi.json から読む。
import { readFileSync } from 'node:fs';
export const name = 'EGG01 たまごの みち: 失敗は板が残り軌跡が出る・向き循環・もどす・正解でクリア・面2の寸法・面8(Issue #290)';

const lesson = JSON.parse(readFileSync(new URL('../../../lessons/egg-01-michi.json', import.meta.url), 'utf8'));
const faces = lesson.steps.filter((s) => s.kind === 'play').map((s) => s.egg);

const cell = (c, r) => `.egg-cell[data-x="${c}"][data-y="${r}"]`;
const msg = (page) => page.textContent('[data-egg-msg]').then((t) => t.trim());
const plates = (page) => page.$$eval('.egg-plate', (els) => els.map((e) => Number(e.dataset.angle)));
const count = async (page, sel) => (await page.$$(sel)).length;
const waitMsg = (page, text) =>
  page.waitForFunction((t) => document.querySelector('[data-egg-msg]')?.textContent.trim() === t, text, { timeout: 8000 });

// 板を solution どおりに置く（置いた直後の向きは0。向きの数だけ再タップ）。
async function placeSolution(page, face) {
  for (const p of face.solution) {
    await page.click(cell(p.col, p.row));
    for (let i = 0; i < p.angle; i += 1) await page.click(cell(p.col, p.row));
  }
}

async function metrics(page) {
  return page.evaluate(() => {
    const g = document.querySelector('[data-egg-grid]').getBoundingClientRect();
    const t = document.querySelector('#egg-try').getBoundingClientRect();
    const u = document.querySelector('#egg-undo').getBoundingClientRect();
    return {
      gw: Math.round(g.width),
      gh: Math.round(g.height),
      tryH: Math.round(t.height),
      undoH: Math.round(u.height),
      fits: document.documentElement.scrollHeight <= window.innerHeight,
      noHScroll: document.documentElement.scrollWidth <= window.innerWidth,
    };
  });
}

export default async function run({ page, check }) {
  await page.setViewportSize({ width: 360, height: 640 });
  await page.goto('/index.html?lesson=egg-01-michi');
  await page.waitForSelector('[data-action="start"]');
  await page.click('[data-action="start"]');
  await page.waitForFunction(() => document.querySelector('#stage')?.dataset.step === 'play');
  await page.waitForSelector('[data-egg-grid]');

  // 1. 面1：5x5・置ける点4つ・板0枚
  await check('面1: 格子5x5・置ける点4つ・板0枚', async () => ({
    cells: await count(page, '.egg-cell'),
    place: await count(page, '.egg-cell.egg-place'),
    plates: await count(page, '.egg-plate'),
  }), { cells: 25, place: 4, plates: 0 });
  await check('面1: 「もどす」は板0枚で押せない', () => page.$eval('#egg-undo', (b) => b.disabled), true);

  // 2. 何も置かず「ためす」→ 落ちる・文言・軌跡1本・板0枚・進まない
  await page.click('#egg-try');
  await waitMsg(page, 'たまごが おちちゃった');
  await check('失敗(何も置かない): 軌跡1本・板0枚・クリア演出なし', async () => ({
    trace: await count(page, '.egg-trace'),
    plates: await count(page, '.egg-plate'),
    d: await count(page, '[data-result-dialog]'),
    step: await page.getAttribute('#stage', 'data-step'),
  }), { trace: 1, plates: 0, d: 0, step: 'play' });

  // 3. 正解の点をタップ → 板1枚。再タップで向きが 0→1→2→3→0
  const sol = faces[0].solution[0];
  await page.click(cell(sol.col, sol.row));
  await check('板を置くと1枚・向き0・軌跡が消える', async () => ({ p: await plates(page), t: await count(page, '.egg-trace') }), { p: [0], t: 0 });
  const seen = [];
  for (let i = 0; i < 4; i += 1) {
    await page.click(cell(sol.col, sol.row));
    seen.push((await plates(page))[0]);
  }
  await check('再タップ3回で4向きを循環し、4回目で最初へ戻る(1→2→3→0)', () => seen, [1, 2, 3, 0]);

  // 5. もどす：板を置いて押すと0枚へ
  await check('板があると「もどす」が押せる', () => page.$eval('#egg-undo', (b) => b.disabled), false);
  await page.click('#egg-undo');
  await check('もどす: 板0枚へ戻る', () => count(page, '.egg-plate'), 0);

  // 7. 失敗後に板を回すと軌跡が消える
  await page.click(cell(sol.col, sol.row));
  await page.click('#egg-try');
  await page.waitForFunction(() => document.querySelector('[data-egg-msg]')?.textContent.trim() !== '', null, { timeout: 8000 });
  // 向き0は正解ではない（solution.angle は 1。別の巣に入る）。軌跡が1本出て板は残る。
  await check('向き0(不正解)で失敗: 軌跡1本・板は残る', async () => ({ m: await msg(page), t: await count(page, '.egg-trace'), p: (await plates(page)).length }), { m: 'べつの すに はいったよ', t: 1, p: 1 });
  await page.click(cell(sol.col, sol.row));
  await check('失敗後に板を回すと軌跡が消える', () => count(page, '.egg-trace'), 0);

  // 4. 正しい向きで「ためす」：再生中は disabled → 「たまごは あんぜん！」→ つぎへ
  // 向き0→1 に回した状態（面1の solution.angle は 1）
  await check('正しい向きになった', async () => (await plates(page))[0], sol.angle);
  await page.click('#egg-try');
  await check('再生中は「ためす」が disabled', () => page.$eval('#egg-try', (b) => b.disabled), true);
  // 再生中の端末の戻る：ヘッダ←が disabled のため画面は動かない
  await page.goBack();
  await check('再生中に端末の戻る: play のまま', () => page.getAttribute('#stage', 'data-step'), 'play');
  await page.waitForSelector('[data-result-dialog]', { timeout: 10000 });
  await check('正解: 「たまごは あんぜん！」・「つぎの ステージ」が出る', async () => ({
    m: await msg(page),
    n: await count(page, '[data-action="next-stage"]'),
  }), { m: 'たまごは あんぜん！', n: 1 });
  await page.click('[data-action="next-stage"]');
  await page.waitForFunction(() => document.querySelector('#stage')?.dataset.step === 'play' && document.querySelector('[data-egg-grid]'));

  // 6. 面2：板を置いた状態で寸法（360x640 と 844x390）
  const f2 = faces[1].solution[0];
  await page.click(cell(f2.col, f2.row));
  await check('面2(360x640): 格子244x244・ボタン48px以上・はみ出し無し', () => metrics(page),
    { gw: 244, gh: 244, tryH: 48, undoH: 48, fits: true, noHScroll: true });
  await page.setViewportSize({ width: 844, height: 390 });
  await check('面2(844x390): 格子244x244・ボタン48px以上・文書高が収まる', () => metrics(page),
    { gw: 244, gh: 244, tryH: 48, undoH: 48, fits: true, noHScroll: true });
  await page.setViewportSize({ width: 768, height: 1024 });
  await check('面2(768x1024): セル64px＝格子324x324', async () => {
    const m = await metrics(page);
    return { gw: m.gw, gh: m.gh };
  }, { gw: 324, gh: 324 });
  await page.setViewportSize({ width: 360, height: 640 });

  // 面8：solution を JSON から読んで1回だけ通す（最終面は「つぎへ」）
  await page.evaluate(async () => {
    const { S } = await import('/js/state.js');
    const { goToStep } = await import('/js/ui-step.js');
    goToStep(S.lesson.steps.findIndex((s) => s.stepId === 'p8'));
  });
  await page.waitForSelector('[data-egg-grid]');
  await page.waitForSelector(cell(faces[7].places[0].col, faces[7].places[0].row));
  await check('面8: 板0枚から始まる', () => count(page, '.egg-plate'), 0);
  await placeSolution(page, faces[7]);
  await check('面8: solution の向きで3枚置いた', () => plates(page), faces[7].solution.map((p) => p.angle));
  await page.click('#egg-try');
  await page.waitForSelector('[data-result-dialog]', { timeout: 10000 });
  await check('面8: 正解で「つぎへ」が出る(つぎの ステージ は出ない)', async () => ({
    next: await count(page, '[data-action="next"]'),
    stage: await count(page, '[data-action="next-stage"]'),
  }), { next: 1, stage: 0 });
}
