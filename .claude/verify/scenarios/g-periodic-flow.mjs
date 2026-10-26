// 盤面エディタ（開発者用）のたたき台パネルで周期ドア（#496 段2）を選ぶ流れ。
// editor-generate-panel と同じく、このシナリオ内でエディタのサーバーを空きポートで起動し、/api/generate は固定応答にする。
import { startEditorServer } from '../../../tools/editor/serve.mjs';

export const name = '盤面エディタ: たたき台に周期ドア（1種まで・範囲1〜2・送信本文）(Issue #496)';

export default async function run({ page, check }) {
  const server = await startEditorServer({ port: 0 });
  try {
    const base = `http://127.0.0.1:${server.address().port}/`;
    const bodies = [];
    const json = (route, obj) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(obj) });
    await page.route('**/api/analyze', (route) => json(route, { status: 'ok', clearable: true, shortest: 6, matters: {}, turns: 1, gradient: [], messages: [] }));
    await page.route('**/favicon.ico', (route) => route.fulfill({ status: 204 }));
    await page.route('**/api/lessons', (route) => json(route, []));
    await page.route('**/api/drafts', (route) => json(route, []));
    await page.route('**/api/generate', (route) => {
      bodies.push(JSON.parse(route.request().postData()));
      return json(route, { status: 'ok', candidates: [] });
    });

    await page.goto(base);
    const disabled = (sel) => page.evaluate((s) => document.querySelector(s).disabled, sel);
    await page.click('#gen-open');
    await check('周期ドアの行（チェック・最小・最大）がある', () => page.evaluate(() => ['on', 'min', 'max'].map((k) => !!document.getElementById(`gen-periodic-${k}`))), [true, true, true]);
    await check('おしえる物に周期ドアがある', () => page.evaluate(() => [...document.querySelectorAll('#gen-teach option')].some((o) => o.value === 'periodic')), true);

    await page.check('#gen-periodic-on');
    await page.selectOption('#gen-teach', 'periodic');
    await check('どんぐりと いっしょでも「つくる」は有効（1種まで）', () => disabled('#gen-run'), false);
    await page.uncheck('#gen-items-on');
    await check('周期ドアだけなら「つくる」が有効', () => disabled('#gen-run'), false);
    await page.fill('#gen-periodic-max', '3');
    await check('ドア数の上限が3だと無効（範囲は1〜2）', () => disabled('#gen-run'), true);
    await page.fill('#gen-periodic-max', '2');
    await check('ドア数1〜2なら有効に戻る', () => disabled('#gen-run'), false);

    await page.click('#gen-run');
    await check('送った本文は gimmicks=periodic{1,2}・teach=periodic', () => bodies[0] && [bodies[0].stageGen.gimmicks, bodies[0].stageGen.teach], [{ periodic: { min: 1, max: 2 } }, 'periodic']);
  } finally {
    server.close();
  }
}
