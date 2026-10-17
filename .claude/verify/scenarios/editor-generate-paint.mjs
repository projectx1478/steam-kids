// 盤面エディタ（開発者用）のたたき台パネルで色ぬり（#495 段2）を選ぶ流れ（editor-generate-paint）。
// editor-generate-panel と同じく、このシナリオ内でエディタのサーバーを空きポートで起動し、/api/generate は固定応答にする。
import { startEditorServer } from '../../../tools/editor/serve.mjs';

export const name = '盤面エディタ: たたき台に色ぬり（単独のみ・範囲4〜8・送信本文）(Issue #495)';

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
    await check('色ぬりの行（チェック・最小・最大）がある', () => page.evaluate(() => ['on', 'min', 'max'].map((k) => !!document.getElementById(`gen-paint-${k}`))), [true, true, true]);
    await check('おしえる物に色ぬりがある', () => page.evaluate(() => [...document.querySelectorAll('#gen-teach option')].some((o) => o.value === 'paint')), true);

    await page.check('#gen-paint-on');
    await page.fill('#gen-paint-min', '4');
    await page.selectOption('#gen-teach', 'paint');
    await check('どんぐりと いっしょだと「つくる」は無効', () => disabled('#gen-run'), true);
    await page.uncheck('#gen-items-on');
    await check('色ぬりだけなら「つくる」が有効', () => disabled('#gen-run'), false);
    await page.fill('#gen-paint-max', '9');
    await check('マス数の上限が9だと無効（範囲は4〜8）', () => disabled('#gen-run'), true);
    await page.fill('#gen-paint-max', '8');
    await check('マス数4〜8なら有効に戻る', () => disabled('#gen-run'), false);

    await page.click('#gen-run');
    await check('送った本文は gimmicks=paint{4,8}・teach=paint', () => bodies[0] && [bodies[0].stageGen.gimmicks, bodies[0].stageGen.teach], [{ paint: { min: 4, max: 8 } }, 'paint']);
  } finally {
    server.close();
  }
}
