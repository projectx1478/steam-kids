// 盤面エディタの「配置」パネル（#618）。エディタ本体のサーバー（tools/editor/serve.mjs）を空きポートで起動し、
// lessons/ を一時にコピーした lessonsDir・一時の backupsDir を渡す（実リポジトリの lessons/ は書き換えない）。期待値は一時の index.json から読む。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startEditorServer } from '../../../tools/editor/serve.mjs';
import { validateIndex } from '../../../tools/lib/validate/index-check.mjs';

export const name = '盤面エディタ: 配置パネル（切替・並べ替え・単元間移動・単元/大項目の追加削除・保存前検査）';

const ROOT = path.resolve(import.meta.dirname, '..', '..', '..');

export default async function run({ page, check, shot }) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'editor-layout-'));
  const lessonsDir = path.join(tmp, 'lessons');
  const backupsDir = path.join(tmp, 'backups');
  fs.cpSync(path.join(ROOT, 'lessons'), lessonsDir, { recursive: true });
  const repoIndexBefore = fs.readFileSync(path.join(ROOT, 'lessons', 'index.json'), 'utf8');
  const idxPath = path.join(lessonsDir, 'index.json');
  const readIndex = () => JSON.parse(fs.readFileSync(idxPath, 'utf8'));
  const readLesson = (id) => JSON.parse(fs.readFileSync(path.join(lessonsDir, `${id}.json`), 'utf8'));
  const backupCount = () => (fs.existsSync(backupsDir) ? fs.readdirSync(backupsDir).filter((f) => /^index-.*\.json$/.test(f)).length : 0);
  const unitOf = (idx, unitId) => idx.tracks.flatMap((t) => t.units).find((u) => u.unitId === unitId);

  const server = await startEditorServer({ port: 0, lessonsDir, backupsDir });
  try {
    const port = server.address().port;
    const base = `http://127.0.0.1:${port}/`;
    await page.route('**/favicon.ico', (route) => route.fulfill({ status: 204 }));
    await page.goto(base);
    await page.waitForSelector('#board .grid-cell');

    const row = (id) => page.locator(`#layout-body .lay-row[data-lesson-id="${id}"]`);
    const save = async () => {
      const done = page.waitForResponse((r) => r.url().endsWith('/api/index') && r.request().method() === 'PUT');
      await page.click('#layout-save');
      await done;
      await page.waitForFunction(() => document.getElementById('layout-ng').textContent === '保存しました');
    };
    const ngText = () => page.evaluate(() => document.getElementById('layout-ng').textContent);

    // 1. パネルを開く
    const idx0 = readIndex();
    await page.click('#layout-open');
    await page.waitForSelector('#layout-panel:not([hidden])');
    await check('パネルの大項目数が index.json の tracks 数と一致', () => page.locator('#layout-body .lay-track').count(), idx0.tracks.length);
    await check('パネルの単元数が index.json の units 合計と一致', () => page.locator('#layout-body .lay-unit').count(), idx0.tracks.reduce((n, t) => n + t.units.length, 0));
    await check('変更なしのとき保存は無効', () => page.isDisabled('#layout-save'), true);
    await shot('editor-layout-open');

    // 2. 公開/devOnly 切替
    const b0 = backupCount();
    await row('cmd-03-naosu').locator('.lay-toggle').click();
    await check('切替で保存が有効になる', () => page.isDisabled('#layout-save'), false);
    await save();
    await check('devOnlyIds に入る', () => unitOf(readIndex(), 'commands').devOnlyIds.includes('cmd-03-naosu'), true);
    await check('lessonIds から消える', () => unitOf(readIndex(), 'commands').lessonIds.includes('cmd-03-naosu'), false);
    await check('backups に index-*.json が1件増える', () => backupCount(), b0 + 1);
    await row('cmd-03-naosu').locator('.lay-toggle').click();
    await save();
    await check('戻しで lessonIds に戻る', () => unitOf(readIndex(), 'commands').lessonIds.includes('cmd-03-naosu'), true);
    await check('戻しで devOnlyIds から消える', () => unitOf(readIndex(), 'commands').devOnlyIds.includes('cmd-03-naosu'), false);

    // 3. 並べ替え
    await check('先頭の ↑ は無効', () => row('ice-01-suberu').locator('button', { hasText: '↑' }).isDisabled(), true);
    await row('ice-02-kabe').locator('button', { hasText: '↑' }).click();
    await save();
    await check('ice の順が入れ替わる', () => unitOf(readIndex(), 'ice').lessonIds, ['ice-02-kabe', 'ice-01-suberu']);

    // 4. 単元間の移動
    await row('ice-01-suberu').locator('.lay-move').selectOption('keys');
    await save();
    await check('index.json で keys 単元へ移る', () => unitOf(readIndex(), 'keys').lessonIds.includes('ice-01-suberu'), true);
    await check('一時の lessons/ice-01-suberu.json の unitId が変わる', () => readLesson('ice-01-suberu').unitId, 'keys');

    // 5. 単元の追加・題名・削除
    const unitForm = (n) => page.locator('#layout-body .lay-add-unit').nth(n);
    await unitForm(1).locator('.lay-add-id').fill('newu');
    await unitForm(1).locator('.lay-add-title').fill('あたらしい');
    await unitForm(1).locator('button').click();
    await check('追加直後は保存できない（レッスンが無い）', () => page.isDisabled('#layout-save'), true);
    await row('switch-01-suicchi').locator('.lay-move').selectOption('newu');
    await save();
    await check('単元の追加が保存される', () => unitOf(readIndex(), 'newu')?.title, 'あたらしい');
    const newUnit = page.locator('#layout-body .lay-unit[data-unit-id="newu"]');
    await newUnit.locator('.lay-title').fill('なおした');
    await newUnit.locator('.lay-title').dispatchEvent('change');
    await save();
    await check('題名の変更が保存される', () => unitOf(readIndex(), 'newu').title, 'なおした');
    await check('レッスンの入った単元の削除ボタンは無効', () => newUnit.locator('.lay-del-unit').isDisabled(), true);
    // 空の単元は保存できないので（#618-6A）、追加した同じ編集の中で削除する。
    await unitForm(1).locator('.lay-add-id').fill('tmpu');
    await unitForm(1).locator('.lay-add-title').fill('いちじ');
    await unitForm(1).locator('button').click();
    const tmpUnit = page.locator('#layout-body .lay-unit[data-unit-id="tmpu"]');
    await check('空の単元の削除ボタンは有効', () => tmpUnit.locator('.lay-del-unit').isDisabled(), false);
    await tmpUnit.locator('.lay-del-unit').click();
    await check('空の単元は削除で消え、変更なしに戻る', async () => (await tmpUnit.count()) === 0 && await page.isDisabled('#layout-save'), true);
    await check('tmpu は index.json に書かれていない', () => unitOf(readIndex(), 'tmpu'), undefined);

    // 大項目の追加：単元（とレッスン）を足すまで保存できない
    await page.locator('#layout-body .lay-add-track .lay-add-id').fill('tr2');
    await page.locator('#layout-body .lay-add-track .lay-add-title').fill('あたらしい大項目');
    await page.locator('#layout-body .lay-add-track button').click();
    await check('単元の無い大項目は保存できない', () => page.isDisabled('#layout-save'), true);
    await check('「単元がありません」と出る', async () => (await page.locator('#layout-body .lay-hint').textContent()).includes('単元がありません'), true);
    const lastForm = page.locator('#layout-body .lay-add-unit').last();
    await lastForm.locator('.lay-add-id').fill('u2');
    await lastForm.locator('.lay-add-title').fill('ひとつめ');
    await lastForm.locator('button').click();
    await row('key-01-kagi').locator('.lay-move').selectOption('u2');
    await check('単元を足してレッスンを移すと保存できる', () => page.isDisabled('#layout-save'), false);
    await save();
    await check('大項目が保存される', () => readIndex().tracks.some((t) => t.trackId === 'tr2' && t.units.some((u) => u.unitId === 'u2')), true);

    // 6. 保存前検査の失敗
    const bytesBefore = fs.readFileSync(idxPath, 'utf8');
    const b1 = backupCount();
    // 意図した 400 がブラウザの console.error / HTTP エラー検知に拾われないよう、ページ外（node）から送る。
    const cur = await (await fetch(`${base}api/index`)).json();
    cur.tracks[0].units[0].lessonIds.push('no-such-lesson');
    const status = (await fetch(`${base}api/index`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cur) })).status;
    await check('存在しない lessonId を含む PUT は 400', () => status, 400);
    await check('index.json はバイト不変', () => fs.readFileSync(idxPath, 'utf8') === bytesBefore, true);
    await check('backups は増えない', () => backupCount(), b1);

    // 7. 保存後の index.json の検査と実リポジトリの不変
    const lessonById = new Map(fs.readdirSync(lessonsDir).filter((f) => f.endsWith('.json') && f !== 'index.json').map((f) => [f.slice(0, -5), JSON.parse(fs.readFileSync(path.join(lessonsDir, f), 'utf8'))]));
    const fileIds = new Set(lessonById.keys());
    await check('保存後の index.json は validateIndex でエラー0件', () => validateIndex(readIndex(), lessonById, fileIds), []);
    await check('実リポジトリの lessons/index.json は不変', () => fs.readFileSync(path.join(ROOT, 'lessons', 'index.json'), 'utf8') === repoIndexBefore, true);
  } finally {
    server.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
