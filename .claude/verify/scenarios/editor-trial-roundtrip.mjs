// 盤面エディタの「ためしあそび」（#403 段2）。エディタ本体のサーバー（tools/editor/serve.mjs）を空きポートで起動し、
// 押した先の別タブ（/play.html?dev=1&trial=1）を同一オリジンで実際に開く。page.route の固定応答は使わない（子ども画面の配信そのものを確かめる）。
import { startEditorServer } from '../../../tools/editor/serve.mjs';

export const name = '盤面エディタ: ためしあそび（stageを渡して別タブで開く・帯・元の盤は不変）';

export default async function run({ page, check, shot }) {
  const server = await startEditorServer({ port: 0 });
  try {
    const port = server.address().port;
    const base = `http://127.0.0.1:${port}/`;
    await page.route('**/favicon.ico', (route) => route.fulfill({ status: 204 }));
    await page.goto(base);
    await page.waitForSelector('#board .grid-cell');

    const cells = () => page.evaluate(() => Object.fromEntries([...document.querySelectorAll('#board .grid-cell')].map((c) => [`${c.dataset.x},${c.dataset.y}`, c.innerHTML])));
    const before = await cells();
    await check('エディタの盤が出ている（5×5）', () => Object.keys(before).length, 25);

    const [popup] = await Promise.all([
      page.waitForEvent('popup'),
      page.click('#trial-open'),
    ]);
    const stored = await page.evaluate(() => JSON.parse(sessionStorage.getItem('editor-trial')));
    await check('sessionStorage に kind==="play" の stage が入る', () => stored.stage.kind, 'play');
    await check('stage に stepId があり gen は無い', () => stored.stage.stepId === 'trial' && !('gen' in stored.stage), true);
    await check('stage の盤はエディタの盤（5×5・start/goal）', () => JSON.stringify([stored.stage.grid, stored.stage.start, stored.stage.goal]), JSON.stringify([{ cols: 5, rows: 5 }, { x: 0, y: 0 }, { x: 4, y: 4 }]));
    await check('ts は数値', () => typeof stored.ts, 'number');

    await popup.waitForSelector('#trial-band');
    await check('popup は同一オリジンの /play.html?dev=1&trial=1', () => popup.url(), `${base}play.html?dev=1&trial=1`);
    await check('帯「ためしあそび中・きろくしない」が出る', () => popup.evaluate(() => document.getElementById('trial-band').textContent), 'ためしあそび中・きろくしない');
    await popup.waitForSelector('.grid-cell');
    await check('popup に盤面（5×5）が出る', () => popup.evaluate(() => document.querySelectorAll('.grid-cell').length), 25);
    // ⚙のメニューを開いた状態で、レッスンせんたくがめん が出ないことを見る（メニューが閉じているだけで通らないよう、パネル自体の表示も確かめる。Issue #467）。
    await popup.click('[data-action="menu"]');
    await check('popup のメニューが開く', () => popup.isVisible('#gear-menu'), true);
    await check('popup のメニューでは レッスンせんたくがめん が出ない', async () => await popup.isVisible('#menu-home'), false);
    await popup.click('#menu-close');
    await check('popup は記録を書かない（steamkids.* に clear 系が無い）', () => popup.evaluate(() => Object.keys(localStorage).filter((k) => /clear|resume|history/i.test(k))), []);
    await shot('editor-trial-popup');

    await check('元タブの編集中の盤面は変わらない', async () => JSON.stringify(await cells()) === JSON.stringify(before), true);
    await popup.close();
    await check('popup を閉じても元タブの盤面は残る', async () => JSON.stringify(await cells()) === JSON.stringify(before), true);
  } finally {
    server.close();
  }
}
