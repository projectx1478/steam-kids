// G3 文言と intro 構成（Issue #554）。
// ① 新文言4つの textContent（おてほんを みる／ためしなおす×2経路／もういちど よそう）を照合し、旧名「もういちど」単独が残らない。
// ② 全ギミックの1本目と対照（teko）で、intro の構成（再生ボタン・そうさほうほう・主ボタンの並びと右寄せ）が
//    docs/ui-rules.md 原則3の規則どおり。
// ③ donguri-01-hirou を全クリアしたあと、intro の ✓ を8個押して data-step-id が押した番号のステージになる。
// 実行順：retry-predict は凍結 fixture（config.mjs）の predict 構成を通る唯一の経路のため最初に見る。
// page.unroute は戻せないので、それ以降は現行 JSON を使う。water・warps は実レッスンに現れず g-water-flow・g-warps-flow が見る。
import { enterPlay, clearStage, clearLesson } from '../helpers.mjs';

export const name = 'G3 文言（おてほんを みる・ためしなおす・もういちど よそう）と intro の構成規則・✓8個の遷移(Issue #554)';

const text = (page, sel) => page.$eval(sel, (e) => e.textContent.replace(/\s/g, ''));
const count = async (page, sel) => (await page.$$(sel)).length;

// このレッスンの途中再開・下書きを消す（再開状態だと intro の並びが変わるため）。localStorage を触るので goto 済みで呼ぶ。
const forgetLesson = (page, id) =>
  page.evaluate((lessonId) => {
    Object.keys(localStorage)
      .filter((k) => k.includes(lessonId) && /resume|draft/i.test(k))
      .forEach((k) => localStorage.removeItem(k));
  }, id);

// [id, 再生ボタンの数, そうさほうほうの数]（docs/ui-rules.md「intro の構成規則」。teko は対照）
const INTROS = [
  ['cmd-01-susumu', 1, 1],
  ['donguri-01-hirou', 1, 1],
  ['ice-01-suberu', 1, 1],
  ['ice-02-kabe', 1, 0],
  ['key-01-kagi', 1, 1],
  ['switch-01-suicchi', 1, 1],
  ['paint-01-nuru', 1, 0],
  ['switch-07-shuuki-door', 1, 0],
  ['teko-01-tsuriai', 0, 0],
];

export default async function run({ page, check }) {
  const labels = {};

  // --- ① retry-predict（凍結 fixture の cmd-01-susumu。unroute しない） ---
  await page.goto('/index.html?lesson=cmd-01-susumu');
  await page.click('[data-action="start"]');
  await page.click('[data-option="A"]');
  await page.waitForSelector('[data-action="retry-predict"]', { timeout: 4000 });
  labels['retry-predict'] = await text(page, '[data-action="retry-predict"]');
  await check('retry-predict: 文言は「もういちど よそう」', async () => labels['retry-predict'], 'もういちどよそう');

  // 以降は現行 JSON（c8-fail-lock.mjs と同じ）
  await page.unroute('**/lessons/cmd-01-susumu.json');
  await page.unroute('**/lessons/donguri-01-hirou.json');

  // --- ② intro の構成（新しい context のため再開・下書きは無いが、念のため cmd-01 の分を消してから開く） ---
  await forgetLesson(page, 'cmd-01-susumu');
  const startRights = [];
  for (const [id, demoN, howN] of INTROS) {
    await page.goto(`/index.html?lesson=${id}`);
    await page.waitForSelector('[data-action="start"]');
    await check(`${id}: 再生ボタンが${demoN}個`, () => count(page, '[data-action="demo-replay"]'), demoN);
    await check(`${id}: そうさほうほうが${howN}個`, () => count(page, '[data-action="how-to"]'), howN);
    await check(`${id}: 主ボタン(はじめる)が1個`, () => count(page, '[data-action="start"]'), 1);
    if (howN > 0) {
      await check(`${id}: そうさほうほうの文言`, () => page.$eval('[data-action="how-to"]', (e) => e.textContent.trim()), 'そうさほうほう');
    }
    if (demoN > 0) {
      await check(`${id}: 再生ボタンは「▶ おてほんを みる」`, () => text(page, '[data-action="demo-replay"]'), '▶おてほんをみる');
    }
    await check(
      `${id}: 下端バーの並び`,
      () => page.$$eval('[data-role="bottom-bar"] > *', (els) => els.map((e) => e.dataset.action)),
      howN > 0 ? ['how-to', 'start'] : ['start']
    );
    const box = await (await page.$('[data-action="start"]')).boundingBox();
    startRights.push(Math.round(box.x + box.width));
    if (howN > 0) {
      const how = await (await page.$('[data-action="how-to"]')).boundingBox();
      await check(`${id}: そうさほうほうは主ボタンの左に詰まる`, async () => how.x + how.width <= box.x + 1, true);
    }
  }
  await check('全intro: 主ボタンの右端がそろう(詰めて右寄せ)', async () => Math.max(...startRights) - Math.min(...startRights) <= 1, true);

  // --- ① retry（失敗後。c8-fail-lock.mjs と同じ手順） ---
  await page.goto('/index.html?lesson=cmd-01-susumu');
  await forgetLesson(page, 'cmd-01-susumu');
  await enterPlay(page, 'cmd-01-susumu');
  await clearStage(page, ['up', 'up', 'left', 'left']);
  await page.click('[data-command="left"]');
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="retry"]', { timeout: 4000 });
  labels.retry = await text(page, '[data-action="retry"]');
  await check('retry: 文言は「↺ ためしなおす」', async () => labels.retry, '↺ためしなおす');

  // --- ① replay（クリア後。clearStage は next を押すので使わない） ---
  await page.goto('/index.html?lesson=cmd-01-susumu');
  await forgetLesson(page, 'cmd-01-susumu');
  await enterPlay(page, 'cmd-01-susumu');
  for (const c of ['up', 'up', 'left', 'left']) await page.click(`[data-command="${c}"]`);
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="replay"]', { timeout: 15000 });
  labels.replay = await text(page, '[data-action="replay"]');
  await check('replay: 文言は「ためしなおす」', async () => labels.replay, 'ためしなおす');

  // demo-replay は ② で読んだ文言（cmd-01-susumu の intro）を再取得
  await page.goto('/index.html?lesson=cmd-01-susumu');
  await forgetLesson(page, 'cmd-01-susumu');
  await page.goto('/index.html?lesson=cmd-01-susumu');
  await page.waitForSelector('[data-action="demo-replay"]');
  labels['demo-replay'] = await text(page, '[data-action="demo-replay"]');
  await check('demo-replay: 文言は「▶ おてほんを みる」', async () => labels['demo-replay'], '▶おてほんをみる');

  await check('旧名「もういちど」単独のボタンが残らない', async () => Object.values(labels).filter((t) => t === 'もういちど').length, 0);

  // --- ③ ✓ 8個（donguri-01-hirou の現行 JSON。全クリアしたあと intro の✓をクリック） ---
  await clearLesson(page, 'donguri-01-hirou');
  const stepIds = await page.evaluate(() =>
    fetch('./lessons/donguri-01-hirou.json')
      .then((r) => r.json())
      .then((l) => l.steps.filter((s) => s.kind === 'play').map((s) => s.stepId))
  );
  await check('donguri-01-hirou: playステージが8本', async () => stepIds.length, 8);
  await check('まとめ: 完了ノードに緑バッジ✓が付く(番号は残る)', async () =>
    page.evaluate(() => {
      const dots = [...document.querySelectorAll('.step-dot')];
      const done = dots.filter((d) => d.querySelector('.step-dot-badge'));
      return done.length === dots.length - 1 && done.every((d) => d.querySelector('.step-dot-badge').textContent === '✓');
    }), true);
  for (let i = 0; i < stepIds.length; i += 1) {
    await page.goto('/index.html?lesson=donguri-01-hirou');
    await page.waitForSelector('button.step-dot');
    const dots = await page.$$('button.step-dot');
    await check(`✓${i + 1}: 押せるノードが8個`, async () => dots.length, 8);
    await check(`✓${i + 1}: 番号が表示される`, () => dots[i].evaluate((e) => e.firstChild.textContent), String(i + 1));
    await dots[i].click();
    await check(`✓${i + 1}: 押すと ${stepIds[i]} へ移る`, () => page.getAttribute('#stage', 'data-step-id'), stepIds[i]);
  }
}
