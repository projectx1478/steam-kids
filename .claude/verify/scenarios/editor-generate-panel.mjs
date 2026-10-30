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
    await page.route('**/api/lessons', (route) => json(route, [{ lessonId: 'dirty-test', stepCount: 1 }, { lessonId: 'base-test', stepCount: 1 }]));
    await page.route('**/api/lessons/base-test', (route) => json(route, { steps: [{ stepId: 'b1', ...board(0, []), water: [{ x: 2, y: 3 }], bridge: [{ x: 2, y: 2 }] }] }));
    await page.route('**/api/lessons/dirty-test', (route) => json(route, { steps: [{ stepId: 's1', ...board(0, WALLS[0]) }] }));
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
    await page.fill('#gen-sp-max', '61');
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

    // 未保存の編集（boardDirty）があるときの確認。レッスンの面を開いて盤を1マス書き換えると真になる
    await page.selectOption('#lesson-select', 'dirty-test');
    await page.waitForSelector('#step-list .st');
    await page.click('#step-list .st');
    await page.click('#board .grid-cell[data-x="3"][data-y="0"]'); // 既定のパレットは壁。空きマスに置いて面と食い違わせる
    const edited = await cells('#board');
    await check('盤を書き換えた', () => Object.keys(edited).length === 16 && edited['3,0'].length > 0, true);
    await page.click('#gen-open');
    await page.click('#gen-run');
    await check('候補が4枚出る（確認の試験）', () => page.evaluate(() => document.querySelectorAll('#gen-cands .gen-cand').length), 4);
    const fourth = await cells('#gen-cands .gen-cand:nth-child(4)');
    const dialogs = [];
    page.once('dialog', (d) => { dialogs.push(d.message()); d.dismiss(); });
    await page.click('#gen-cands .gen-cand:nth-child(4) .gen-pick');
    await check('未保存の編集があると確認が出る', () => dialogs.length, 1);
    await check('確認の文面にたたき台とある', () => dialogs[0].includes('たたき台'), true);
    await check('キャンセルすると盤は変わらない', async () => JSON.stringify(await cells('#board')) === JSON.stringify(edited), true);
    await check('キャンセルするとパネルは開いたまま', () => hidden('#gen-panel'), false);
    page.once('dialog', (d) => { dialogs.push(d.message()); d.accept(); });
    await page.click('#gen-cands .gen-cand:nth-child(4) .gen-pick');
    await check('OK すると候補が読み込まれる', async () => JSON.stringify(await cells('#board')) === JSON.stringify(fourth), true);
    await check('OK でパネルが閉じる', () => hidden('#gen-panel'), true);
    await check('確認は計2回', () => dialogs.length, 2);

    // 土台（#631）。水と橋のある面を開いて、いまの盤を土台にする
    await page.waitForSelector('#lesson-select option[value="base-test"]', { state: 'attached' }); // option は可視にならない
    await page.selectOption('#lesson-select', 'base-test');
    await page.waitForFunction(() => document.querySelectorAll('#step-list .st').length === 1 && document.querySelector('#step-list .st').textContent.includes('b1'));
    await page.click('#step-list .st');
    await page.click('#gen-open');
    await check('開いた直後は土台 OFF', () => page.evaluate(() => { const e = document.querySelector('#gen-base-on'); return [!!e, e && e.checked]; }), [true, false]);
    await page.check('#gen-base-on');
    mode = 'ok';
    await page.click('#gen-run');
    await check('土台 ON の本文に base（grid・water・bridge）があり grid が無い', () => { const b = bodies[bodies.length - 1].stageGen; return [Object.keys(b.base), 'grid' in b, 'gimmicks' in b && 'water' in b.gimmicks]; }, [['grid', 'water', 'bridge'], false, false]);
    await check('土台 ON で土台で決まる欄が無効', () => page.evaluate(() => ['#gen-cols-min', '#gen-water-on', '#gen-paint-on'].map((s) => document.querySelector(s).disabled)), [true, true, true]);
    await check('土台 ON で縮小図が出る', () => page.evaluate(() => document.querySelectorAll('#gen-base-view .grid-cell').length), 16);
    await page.evaluate(() => document.querySelector('#board .grid-cell[data-x="0"][data-y="3"]').click()); // 盤を1マス書き換える（未置換にする）
    await check('土台 ON で盤を未置換にすると「つくる」が無効', () => disabled('#gen-run'), true);
    await check('未置換の理由が出る', () => text('#gen-problems'), '土台にするには、盤を置き換えてから');
    await page.click('#gen-close');
    await page.click('#gen-open');
    await check('閉じて開き直すと土台 OFF', () => page.evaluate(() => document.querySelector('#gen-base-on').checked), false);
  } finally {
    server.close();
  }
}
