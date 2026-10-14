// 盤面エディタ（開発者用）の「たたき台」パネル（#401 段2）。エディタ本体は子ども画面のサーバーと別なので、
// このシナリオ内で tools/editor/serve.mjs を空きポートで起動して開く。/api/generate は page.route で固定応答に差し替える。
import { startEditorServer } from '../../../tools/editor/serve.mjs';

export const name = '盤面エディタ: たたき台パネル（候補・失敗文言・不正入力・読込後の盤）';

const board = (seed, walls) => ({
  grid: { cols: 4, rows: 4 },
  start: { x: 0, y: 0 },
  goal: { x: 3, y: 3 },
  walls,
  items: [{ x: 1, y: 2 }],
  allowedCommands: ['up', 'down', 'left', 'right'],
  solution: ['down', 'down', 'down', 'right', 'right', 'right'],
  maxCommands: 8,
});
const WALLS = [[{ x: 1, y: 0 }], [{ x: 2, y: 0 }], [{ x: 1, y: 1 }], [{ x: 2, y: 2 }]];
const candidates = (seed) => WALLS.map((w, i) => ({ seed: seed + i, board: board(seed + i, w), shortestPath: 6 }));

export default async function run({ page, check, shot }) {
  const server = await startEditorServer({ port: 0 });
  try {
    const base = `http://127.0.0.1:${server.address().port}/`;
    let mode = 'ok';
    let release = null;
    const gate = new Promise((r) => { release = r; });
    const bodies = [];
    const json = (route, obj) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(obj) });
    await page.route('**/api/analyze', (route) => json(route, { status: 'ok', clearable: true, shortest: 6, matters: {}, turns: 1, gradient: [], messages: [] }));
    await page.route('**/favicon.ico', (route) => route.fulfill({ status: 204 }));
    await page.route('**/api/lessons', (route) => json(route, []));
    await page.route('**/api/drafts', (route) => json(route, []));
    await page.route('**/api/generate', async (route) => {
      const req = JSON.parse(route.request().postData());
      bodies.push(req);
      if (mode === 'hang') { await gate; await route.abort().catch(() => {}); return; }
      if (mode === 'empty') return json(route, { status: 'empty', candidates: [] });
      if (mode === 'aborted') return json(route, { status: 'aborted', candidates: [] });
      return json(route, { status: 'ok', candidates: candidates(req.seed) });
    });

    await page.goto(base);
    const text = (sel) => page.evaluate((s) => document.querySelector(s).textContent, sel);
    const hidden = (sel) => page.evaluate((s) => document.querySelector(s).hidden, sel);
    const disabled = (sel) => page.evaluate((s) => document.querySelector(s).disabled, sel);

    await check('パネルは最初は閉じている', () => hidden('#gen-panel'), true);
    await page.click('#gen-open');
    await check('「たたき台」でパネルが開く', () => hidden('#gen-panel'), false);
    await check('既定の入力で「つくる」を押せる', () => disabled('#gen-run'), false);

    // 不正入力
    await page.fill('#gen-cols-min', '2');
    await check('よこの下限が範囲外なら「つくる」は無効', () => disabled('#gen-run'), true);
    await check('範囲外の理由が出る', () => page.evaluate(() => document.querySelector('#gen-problems').children.length), 1);
    await page.fill('#gen-cols-min', '4');
    await page.fill('#gen-sp-max', '17');
    await check('最短手数の上限が範囲外なら無効', () => disabled('#gen-run'), true);
    await page.fill('#gen-sp-max', '8');
    await page.fill('#gen-seed', '');
    await check('シードが空なら無効', () => disabled('#gen-run'), true);
    await page.fill('#gen-seed', '1');
    await page.selectOption('#gen-teach', 'ice');
    await check('おしえる物が使うギミックに無ければ無効', () => disabled('#gen-run'), true);
    await page.selectOption('#gen-teach', 'items');
    await check('直すと「つくる」が有効に戻る', () => disabled('#gen-run'), false);

    // 候補4枚
    await page.click('#gen-run');
    await check('候補が4枚出る', () => page.evaluate(() => document.querySelectorAll('#gen-cands .gen-cand').length), 4);
    await check('各候補に盤面（16マス）が描かれる', () => page.evaluate(() => [...document.querySelectorAll('#gen-cands .gen-cand')].map((c) => c.querySelectorAll('.grid-cell').length)), [16, 16, 16, 16]);
    await check('送った本文は seed=1・count=4・gimmicks=items', () => bodies[0] && [bodies[0].seed, bodies[0].count, Object.keys(bodies[0].stageGen.gimmicks), bodies[0].stageGen.teach], [1, 4, ['items'], 'items']);
    await check('候補の seed は 1〜4', () => page.evaluate(() => [...document.querySelectorAll('#gen-cands .gen-cand')].map((c) => c.dataset.seed)), ['1', '2', '3', '4']);
    await check('成功時は失敗文言が出ない', () => text('#gen-status'), '');

    // もう4枚
    await check('「もう4枚」が押せる', () => disabled('#gen-more'), false);
    await page.click('#gen-more');
    await check('「もう4枚」で seed が4進む', () => page.evaluate(() => [...document.querySelectorAll('#gen-cands .gen-cand')].map((c) => c.dataset.seed)), ['5', '6', '7', '8']);

    // 失敗文言3種
    mode = 'empty';
    await page.click('#gen-run');
    await check('0件の文言', () => text('#gen-status'), '条件に合う盤が出なかった。範囲を広げる');
    await check('0件なら候補は0枚', () => page.evaluate(() => document.querySelectorAll('#gen-cands .gen-cand').length), 0);
    mode = 'aborted';
    await page.click('#gen-run');
    await check('未完了の文言', () => text('#gen-status'), '重すぎて途中で止めた。大きさかギミックを減らす');
    mode = 'hang';
    await page.click('#gen-run');
    await check('生成中の文言', () => text('#gen-status'), 'つくっています…');
    await check('生成中は「やめる」が出て「つくる」は無効', async () => [await hidden('#gen-cancel'), await disabled('#gen-run')], [false, true]);
    await page.click('#gen-cancel');
    await check('「やめる」で中断される', () => text('#gen-status'), 'やめました');
    await check('中断後は「やめる」が消え「つくる」が有効', async () => [await hidden('#gen-cancel'), await disabled('#gen-run')], [true, false]);
    release();

    // これで編集
    mode = 'ok';
    await page.fill('#gen-seed', '10');
    await page.click('#gen-run');
    await check('候補が4枚出る（seed=10）', () => page.evaluate(() => document.querySelectorAll('#gen-cands .gen-cand').length), 4);
    const cells = (root) => page.evaluate((r) => Object.fromEntries([...document.querySelectorAll(`${r} .grid-cell`)].map((c) => [`${c.dataset.x},${c.dataset.y}`, c.innerHTML])), root);
    const third = await cells('#gen-cands .gen-cand:nth-child(3)');
    await page.click('#gen-cands .gen-cand:nth-child(3) .gen-pick');
    await check('「これで編集」でパネルが閉じる', () => hidden('#gen-panel'), true);
    await check('エディタの盤が選んだ候補（4×4）と一致する', async () => JSON.stringify(await cells('#board')) === JSON.stringify(third) && Object.keys(third).length === 16, true);
    await check('状態行に読み込んだ seed が出る', () => text('#status').then((t) => t.includes('seed 12')), true);
    await shot('editor-generate');
  } finally {
    server.close();
  }
}
