// 禁止パターン検査（Issue #347・docs/components.md）：共通部品 js/ui-clear.js の外で、部品の中身を自前で組むのを防ぐ。
// ファイル単位の正規表現。js/ui-clear.js は除外。例外は該当行の行末コメント `// allow-clear: 理由`。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const CLEAR = 'js/ui-clear.js';
const ALLOW = /\/\/\s*allow-clear:\s*\S/;
const ALLOW_CSS = /\/\*\s*allow-clear:\s*\S/; // CSS は /* allow-clear: 理由 */

// 1) ダイアログの自前生成（.show( はファイル単位では要素を区別できないので全部対象。誤検知は allow-clear で逃がす）
const DIALOG_RES = [/createElement\(\s*['"]dialog['"]\s*\)/, /\.showModal\(/, /\.show\(/, /result-row/, /result-dialog/];
// 2) 待ち時間の直書き（ui-clear.js を import するファイルのみ）
const WAIT_RES = [/setTimeout\([^;]*,\s*(1500|1000)\s*\)/, /const\s+RESULT_GAP/];
// 3) 星サイズの直書き
const STAR_JS_RE = /style\.(width|height)\s*=\s*['"]20px['"]/;
const STAR_CSS_RE = /(?<![-\w])(width|height)\s*:\s*20px/;

const importsClear = (src) => /import\s[^;]*['"][^'"]*ui-clear(\.js)?['"]/.test(src);

// 行単位で正規表現に当たる行番号を返す。allow-clear の行は除く。
function lineHits(src, res) {
  return src.split('\n').flatMap((line, i) => (res.some((re) => re.test(line)) && !ALLOW.test(line) ? [i + 1] : []));
}

export function checkDialog(src) {
  return lineHits(src, DIALOG_RES);
}
export function checkWait(src) {
  return importsClear(src) ? lineHits(src, WAIT_RES) : [];
}
export function checkStarJs(src) {
  return lineHits(src, [STAR_JS_RE]);
}
// tailwind.src.css：セレクタに .sk-clear- を含まないルールの中の width/height: 20px
export function checkStarCss(src) {
  const text = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  const hits = [];
  for (const m of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (m[1].includes('.sk-clear-')) continue;
    const bodyStart = m.index + m[0].indexOf('{') + 1;
    const lines = m[2].split('\n');
    let offset = bodyStart;
    for (const line of lines) {
      if (STAR_CSS_RE.test(line) && !ALLOW_CSS.test(src.slice(offset, offset + line.length))) {
        hits.push(text.slice(0, offset).split('\n').length);
      }
      offset += line.length + 1;
    }
  }
  return hits;
}

function jsFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.posix.join(dir, e.name);
    if (e.isDirectory()) return e.name === 'vendor' ? [] : jsFiles(p);
    return e.name.endsWith('.js') && p !== CLEAR ? [p] : [];
  });
}

const files = jsFiles('js');
const read = (f) => readFileSync(f, 'utf-8');

test('実コード：ダイアログを js/ui-clear.js 以外で自前生成していない', () => {
  const bad = files.flatMap((f) => checkDialog(read(f)).map((n) => `${f}:${n}`));
  assert.deepEqual(bad, []);
});

test('実コード：ui-clear.js を使うファイルに待ち時間の直書き・RESULT_GAP の再定義が無い', () => {
  const bad = files.flatMap((f) => checkWait(read(f)).map((n) => `${f}:${n}`));
  assert.deepEqual(bad, []);
});

test('実コード：星サイズ 20px を js/ と tailwind.src.css の部品外に直書きしていない', () => {
  const js = files.flatMap((f) => checkStarJs(read(f)).map((n) => `${f}:${n}`));
  const css = checkStarCss(read('tailwind.src.css')).map((n) => `tailwind.src.css:${n}`);
  assert.deepEqual([...js, ...css], []);
});

test('検査の対象：js/ui-clear.js を除外した js/ を読んでいる（読み漏れで素通りしない）', () => {
  assert.ok(files.length > 10);
  assert.ok(!files.includes(CLEAR));
  assert.ok(files.includes('js/ui-play.js'));
  assert.ok(importsClear(read('js/ui-play.js')));
});

test('ダミー：ダイアログの自前生成は赤、allow-clear 付きは緑', () => {
  for (const bad of [
    "const d = document.createElement('dialog');",
    'dlg.showModal();',
    'dlg.show();',
    "el.className = 'result-row';",
    "el.dataset.x = 'result-dialog';",
  ]) {
    assert.equal(checkDialog(bad).length, 1, bad);
    assert.deepEqual(checkDialog(`${bad} // allow-clear: 別の部品のdialog`), [], bad);
  }
  assert.deepEqual(checkDialog('const x = 1;'), []);
});

test('ダミー：待ち時間の直書きは赤、allow-clear 付き・ui-clear.js を使わないファイルは緑', () => {
  const head = "import { showClearSequence } from './ui-clear.js';\n";
  for (const bad of ['setTimeout(() => go(), 1500);', 'setTimeout(go, 1000);', 'const RESULT_GAP = 1500;', 'const RESULT_GAP_MS = 1;']) {
    assert.equal(checkWait(head + bad).length, 1, bad);
    assert.deepEqual(checkWait(`${head}${bad} // allow-clear: 別用途`), [], bad);
    assert.deepEqual(checkWait(bad), [], `${bad}（import なし）`);
  }
  assert.deepEqual(checkWait(head + 'setTimeout(go, 500);\nanimate({ durationMs: 1000 });'), []);
});

test('ダミー：星サイズの直書きは赤、allow-clear 付き・部品内・対象外は緑', () => {
  assert.equal(checkStarJs("el.style.width = '20px';").length, 1);
  assert.deepEqual(checkStarJs("el.style.width = '20px'; // allow-clear: 星ではない"), []);
  assert.deepEqual(checkStarJs("el.style.width = '24px';"), []);
  const bad = '.foo svg {\n  width: 20px;\n}\n';
  assert.deepEqual(checkStarCss(bad), [2]);
  assert.deepEqual(checkStarCss('.foo {\n  height: 20px; /* x */\n}\n').length, 1);
  assert.deepEqual(checkStarCss('.foo {\n  width: 20px; /* allow-clear: 星ではない */\n}\n'), []);
  assert.deepEqual(checkStarCss('@layer components {\n  .sk-clear-reaction svg {\n    width: 20px;\n    height: 20px;\n  }\n}\n'), []);
  assert.deepEqual(checkStarCss('.a {\n  min-height: 20px;\n  line-height: 20px;\n}\n'), []);
});
