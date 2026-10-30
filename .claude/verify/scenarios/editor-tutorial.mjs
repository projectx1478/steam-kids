// 盤面エディタのチュートリアル面の作成（#617）。エディタ本体のサーバー（tools/editor/serve.mjs）を空きポートで起動し、
// lessons/ を一時にコピーした lessonsDir・一時の backupsDir を渡す（実リポジトリの lessons/ は書き換えない）。題材は tutorial 無しの ice-02-kabe。
// 保存 NG（400）は意図した応答なので、run.mjs が 400 を失敗に数えないよう、別の browser context のページで操作する。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startEditorServer } from '../../../tools/editor/serve.mjs';

export const name = '盤面エディタ: チュートリアル面（足す・文面・命令ボタンの手順・保存検査・消す）';

const ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const LESSON = 'ice-02-kabe';

export default async function run({ page, check, shot }) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'editor-tutorial-'));
  const lessonsDir = path.join(tmp, 'lessons');
  const backupsDir = path.join(tmp, 'backups');
  fs.cpSync(path.join(ROOT, 'lessons'), lessonsDir, { recursive: true });
  const file = path.join(lessonsDir, `${LESSON}.json`);
  const raw = () => fs.readFileSync(file, 'utf8');
  const tutOf = () => JSON.parse(raw()).steps.find((s) => s.kind === 'tutorial');
  const repoBefore = fs.readFileSync(path.join(ROOT, 'lessons', `${LESSON}.json`), 'utf8');

  const server = await startEditorServer({ port: 0, lessonsDir, backupsDir });
  const ctx = await page.context().browser().newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  const pageErrors = [];
  p.on('pageerror', (err) => pageErrors.push(err.message));
  try {
    const base = `http://127.0.0.1:${server.address().port}/`;
    await p.route('**/favicon.ico', (route) => route.fulfill({ status: 204 }));
    await p.goto(base);
    await p.waitForSelector('#board .grid-cell');

    const putDone = () => p.waitForResponse((r) => r.url().endsWith(`/api/lessons/${LESSON}`) && r.request().method() === 'PUT');
    const saveOk = async () => {
      const done = putDone();
      await p.click('#lesson-save');
      await done;
      await p.waitForFunction(() => document.getElementById('lesson-save').disabled);
    };
    const saveNg = async () => {
      const done = putDone();
      await p.click('#lesson-save');
      await done;
      await p.waitForFunction(() => document.getElementById('save-ng').textContent.length > 0);
    };
    const ngText = () => p.evaluate(() => document.getElementById('save-ng').textContent);
    const chipTexts = () => p.evaluate(() => [...document.querySelectorAll('#tut-chips .tut-chip:not(.run)')].map((c) => c.firstChild.textContent));

    // 1. ice-02-kabe を開き、play 面 p1 を選ぶ
    await p.selectOption('#lesson-select', LESSON);
    await p.waitForSelector('#step-list .st');
    await p.click('#step-list .st[data-index="1"]');
    await p.waitForFunction(() => !document.getElementById('tut-add').disabled);
    await check('tutorial 欄は最初は隠れている', () => p.isHidden('#tut-ctl'), true);

    // 2. チュートリアルを足す
    await p.click('#tut-add');
    await check('面が1つ増えて5つになる', () => p.locator('#step-list .st').count(), 5);
    await check('intro s1 の直後（2番目）に tutorial の行がある', async () => (await p.locator('#step-list .st').nth(1).innerText()).includes('(tutorial)'), true);
    await check('足した後は「チュートリアルを足す」が無効', () => p.isDisabled('#tut-add'), true);
    await check('tutorial 欄が出る', () => p.isVisible('#tut-ctl'), true);
    await check('命令ボタンは p1 の allowedCommands（4つ）が出る', () => p.evaluate(() => ['up', 'down', 'left', 'right'].map((d) => !document.getElementById(`tut-cmd-${d}`).hidden)), [true, true, true, true]);
    await check('手順が空のとき「1つ戻す」は無効', () => p.isDisabled('#tut-back'), true);
    await shot('editor-tutorial-added');

    // 3. 文面と、p1 の solution（right・down・down・down）を命令ボタンで足す
    await p.fill('#tut-text', 'ここを おす');
    for (const d of ['right', 'down', 'down', 'down']) await p.click(`#tut-cmd-${d}`);
    await check('チップが4つ並ぶ', () => chipTexts(), ['→', '↓', '↓', '↓']);
    await check('末尾に「▶じっこう」が固定表示される', () => p.locator('#tut-chips > :last-child').evaluate((e) => e.id + ':' + e.textContent), 'tut-run:▶じっこう');
    await check('ためし：ゴールに つく', () => p.textContent('#tut-reach'), 'ためし：ゴールに つく');
    await shot('editor-tutorial-script');

    // 4. 保存
    await saveOk();
    await check('保存後 #save-ng は空', () => ngText(), '');
    await check('tutorial の text が入る', () => tutOf().text, 'ここを おす');
    await check('script は right・down・down・down と末尾の run', () => tutOf().script, [{ tap: 'right' }, { tap: 'down' }, { tap: 'down' }, { tap: 'down' }, { tap: 'run' }]);
    await check('allowedCommands は p1 と同じ', () => tutOf().allowedCommands, JSON.parse(raw()).steps.find((s) => s.stepId === 'p1').allowedCommands);
    await check('tutorial は intro s1 の直後', () => JSON.parse(raw()).steps.map((s) => s.kind), ['intro', 'tutorial', 'play', 'play', 'summary']);

    // 5. 1つ戻す → ゴールに着かない手順は保存できない
    const okBytes = raw();
    await p.click('#tut-back');
    await check('1つ戻すでチップが3つになる', () => chipTexts(), ['→', '↓', '↓']);
    await check('ためし：ゴールに つかない', () => p.textContent('#tut-reach'), 'ためし：ゴールに つかない');
    await saveNg();
    await check('#save-ng に「チュートリアルの到達可能性」が出る', async () => (await ngText()).includes('チュートリアルの到達可能性'), true);
    await check('ファイルは変わらない', () => raw() === okBytes, true);
    await p.click('#tut-cmd-down');
    await check('down を足し直すとチップが4つ', () => chipTexts(), ['→', '↓', '↓', '↓']);
    await saveOk();
    await check('再保存で #save-ng が消える', () => ngText(), '');
    await check('再保存の script は4手＋run', () => tutOf().script.length, 5);

    // 6. 文面が20字超だと保存できない
    const okBytes2 = raw();
    await p.fill('#tut-text', 'あ'.repeat(21));
    await saveNg();
    await check('#save-ng に「文字数」が出る', async () => (await ngText()).includes('文字数'), true);
    await check('文字数 NG のときファイルは変わらない', () => raw() === okBytes2, true);

    // 6b. 元に戻す／やり直し（#628）：tutorial の文面・手順も一緒に戻る
    await p.click('#undo');
    await check('文面入力のあと元に戻すと #tut-text が前の値', () => p.inputValue('#tut-text'), 'ここを おす');
    await p.click('#tut-cmd-right');
    await check('手順を足すとチップが5つ', () => chipTexts(), ['→', '↓', '↓', '↓', '→']);
    await p.click('#undo');
    await check('元に戻すでチップが4つに減る', () => chipTexts(), ['→', '↓', '↓', '↓']);
    await p.click('#redo');
    await check('やり直しでチップが復活する', () => chipTexts(), ['→', '↓', '↓', '↓', '→']);
    await p.click('#undo');
    await check('もう一度戻すとチップが4つ', () => chipTexts(), ['→', '↓', '↓', '↓']);

    // 別の面へ切り替えても「捨てますか」の確認が出ない（戻した結果が面と一致している）
    let dialogSeen = false;
    const onDialog = (d) => { dialogSeen = true; d.dismiss(); };
    p.on('dialog', onDialog);
    await p.click('#step-list .st[data-index="2"]');
    await p.waitForFunction(() => document.getElementById('tut-ctl').hidden);
    p.off('dialog', onDialog);
    await check('undo 後の面切替で confirm が出ない', () => dialogSeen, false);

    // play 面で元に戻す：tutorial 欄は隠れたまま、保存ボタンの disabled は変わらない
    const saveDisBefore = await p.isDisabled('#lesson-save');
    const pausesBefore = await p.inputValue('#max-pauses');
    await p.fill('#max-pauses', '1');
    await p.press('#max-pauses', 'Tab');
    await check('play 面で「とめる回数」を変えると元に戻すが有効', () => p.isDisabled('#undo'), false);
    await p.click('#undo');
    await check('play 面の元に戻すで値が戻る', () => p.inputValue('#max-pauses'), pausesBefore);
    await check('play 面の元に戻すで #tut-ctl は隠れたまま', () => p.isHidden('#tut-ctl'), true);
    await check('play 面の元に戻すで保存ボタンの disabled は変わらない', () => p.isDisabled('#lesson-save'), saveDisBefore);

    // tutorial 面へ戻り、#tut-text で Ctrl+Z を押しても盤は戻らない（#512）
    await p.click('#step-list .st[data-index="1"]');
    await p.waitForFunction(() => !document.getElementById('tut-ctl').hidden);
    await p.click('#tut-cmd-right');
    await check('Ctrl+Z の前：やり直しは無効', () => p.isDisabled('#redo'), true);
    await p.focus('#tut-text');
    await p.keyboard.press('Control+z');
    await check('#tut-text で Ctrl+Z を押しても盤は戻らない（やり直しは無効のまま）', () => p.isDisabled('#redo'), true);
    await check('#tut-text で Ctrl+Z を押しても手順のチップは戻らない', () => chipTexts(), ['→', '↓', '↓', '↓', '→']);

    // 7. この面を消す → 保存
    p.once('dialog', (d) => d.accept());
    await p.click('#tut-del');
    await check('消した後 tutorial 欄は隠れる', () => p.isHidden('#tut-ctl'), true);
    // 消した直後は選択なし（removeStep → reselect で selected=null）なので足せない。play の面を選ぶと再び足せる。
    await check('消した直後は面を選んでいないので「チュートリアルを足す」は無効', () => p.isDisabled('#tut-add'), true);
    p.once('dialog', (d) => d.accept());
    await p.click('#step-list .st[data-index="1"]');
    await check('play の面を選ぶと 「チュートリアルを足す」は有効に戻る', () => p.isDisabled('#tut-add'), false);
    await saveOk();
    await check('保存後 #save-ng は空', () => ngText(), '');
    await check('一時のレッスン JSON に tutorial が無い', () => JSON.parse(raw()).steps.some((s) => s.kind === 'tutorial'), false);

    await check('実リポジトリの lessons/ice-02-kabe.json は不変', () => fs.readFileSync(path.join(ROOT, 'lessons', `${LESSON}.json`), 'utf8') === repoBefore, true);
    await check('pageerror が出ていない', () => pageErrors, []);
  } finally {
    await ctx.close();
    server.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
