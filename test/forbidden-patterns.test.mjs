// 禁止パターン検査（Issue #347・#349・docs/components.md）：共通部品 js/ui-clear.js の外で、部品の中身を自前で組むのを防ぐ。
// 項目は test/forbidden-registry.mjs の登録表、件数の基準は test/forbidden-baseline.json。
// 件数が基準より増えても減っても赤（減ったら基準を下げる）。例外は行末コメント `// allow-component:<id> 理由`。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { CLEAR, SCREEN, EXCLUDES, REGISTRY, measure, judge } from './forbidden-registry.mjs';

export { checkDialog, checkWait, checkStarJs, checkStarCss } from './forbidden-registry.mjs';
import { checkDialog, checkWait, checkStarJs, checkStarCss, checkShowSuccess, checkConfetti, checkClearRecord, checkClearLog, checkScreen } from './forbidden-registry.mjs';

function jsFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.posix.join(dir, e.name);
    if (e.isDirectory()) return e.name === 'vendor' ? [] : jsFiles(p);
    return e.name.endsWith('.js') ? [p] : [];
  });
}

const read = (f) => readFileSync(f, 'utf-8');
const sources = Object.fromEntries([...jsFiles('js'), 'tailwind.src.css'].map((f) => [f, read(f)]));
const baseline = JSON.parse(read('test/forbidden-baseline.json'));
const importsClear = (src) => /import\s[^;]*['"][^'"]*ui-clear(\.js)?['"]/.test(src);

test('実コード：禁止パターンの件数が基準ファイルと一致する（増えても減っても赤）', () => {
  assert.deepEqual(judge(measure(sources), baseline), []);
});

test('検査の対象：js/ を読んでいる（読み漏れで素通りしない）・除外は2ファイルまで', () => {
  const files = Object.keys(sources).filter((f) => f !== CLEAR && f.startsWith('js/'));
  assert.ok(files.length > 10);
  assert.ok(Object.hasOwn(sources, CLEAR));
  assert.ok(files.includes('js/ui-play.js'));
  assert.ok(importsClear(sources['js/ui-play.js']));
  assert.ok(EXCLUDES.length <= 2);
  for (const e of EXCLUDES) {
    assert.ok(Object.hasOwn(sources, e.file), `${e.file} が無い`);
    assert.ok(e.理由 && e.理由.length > 0, `${e.file} の理由が無い`);
  }
});

test('ダミー：ダイアログの自前生成は赤、allow-component:dialog 付きは緑', () => {
  for (const bad of [
    "const d = document.createElement('dialog');",
    'dlg.showModal();',
    'dlg.show();',
    "el.className = 'result-row';",
    "el.dataset.x = 'result-dialog';",
  ]) {
    assert.equal(checkDialog(bad).length, 1, bad);
    assert.deepEqual(checkDialog(`${bad} // allow-component:dialog 別の部品のdialog`), [], bad);
    assert.equal(checkDialog(`${bad} // allow-component:wait 別のid`).length, 1, bad);
  }
  assert.deepEqual(checkDialog('const x = 1;'), []);
});

test('ダミー：待ち時間の直書きは赤、allow-component:wait 付き・ui-clear.js を使わないファイルは緑', () => {
  const head = "import { showClearSequence } from './ui-clear.js';\n";
  for (const bad of ['setTimeout(() => go(), 1500);', 'setTimeout(go, 1000);', 'const RESULT_GAP = 1500;', 'const RESULT_GAP_MS = 1;']) {
    assert.equal(checkWait(head + bad).length, 1, bad);
    assert.deepEqual(checkWait(`${head}${bad} // allow-component:wait 別用途`), [], bad);
    assert.deepEqual(checkWait(bad), [], `${bad}（import なし）`);
  }
  assert.deepEqual(checkWait(head + 'setTimeout(go, 500);\nanimate({ durationMs: 1000 });'), []);
});

test('ダミー：星サイズの直書きは赤、allow-component:star 付き・部品内・対象外は緑', () => {
  assert.equal(checkStarJs("el.style.width = '20px';").length, 1);
  assert.deepEqual(checkStarJs("el.style.width = '20px'; // allow-component:star 星ではない"), []);
  assert.deepEqual(checkStarJs("el.style.width = '24px';"), []);
  const bad = '.foo svg {\n  width: 20px;\n}\n';
  assert.deepEqual(checkStarCss(bad), [2]);
  assert.deepEqual(checkStarCss('.foo {\n  height: 20px; /* x */\n}\n').length, 1);
  assert.deepEqual(checkStarCss('.foo {\n  width: 20px; /* allow-component:star 星ではない */\n}\n'), []);
  assert.deepEqual(checkStarCss('@layer components {\n  .sk-clear-reaction svg {\n    width: 20px;\n    height: 20px;\n  }\n}\n'), []);
  assert.deepEqual(checkStarCss('.a {\n  min-height: 20px;\n  line-height: 20px;\n}\n'), []);
});

test('ダミー：新4項目は赤、定義・import・コメント行・allow-component 付きは緑', () => {
  const cases = [
    [checkShowSuccess, 'showsuccess', 'showSuccess(bar, { view });', ['export function showSuccess(slotEl) {', "import { showSuccess } from './ui-reaction.js';", '// showSuccess(bar) を呼ぶ']],
    [checkConfetti, 'confetti', 'view?.confetti?.({ count: 1 });', ['// view.confetti() の説明']],
    [checkConfetti, 'confetti', 'screenConfetti(opts);', ['export function screenConfetti(o) {', "import { screenConfetti } from './ui-grid.js';"]],
    [checkClearRecord, 'clearrecord', 'markLessonCleared();', ['export function markLessonCleared() {']],
    [checkClearRecord, 'clearrecord', '  saveResumePoint();', ['export function saveResumePoint() {']],
    [checkClearLog, 'clearlog', "logEvent('clear', {});", ["if (e.type === 'clear') x();"]],
    [checkClearLog, 'clearlog', 'logEvent("stage_clear", { stage: 1 });', []],
  ];
  for (const [fn, id, bad, oks] of cases) {
    assert.equal(fn(bad).length, 1, bad);
    assert.deepEqual(fn(`${bad} // allow-component:${id} 理由`), [], bad);
    for (const ok of oks) assert.deepEqual(fn(ok), [], ok);
  }
});

test('ダミー：操作画面の枠の旧クラス名は赤、allow-component:screen 付き・コメント行・別の名前は緑', () => {
  for (const cls of ['play-screen', 'status-bar', 'board-area', 'controller-panel', 'action-row']) {
    const bad = `el.className = '${cls} text-xl';`;
    assert.equal(checkScreen(bad).length, 1, bad);
    assert.deepEqual(checkScreen(`${bad} // allow-component:screen 別用途の問い文`), [], bad);
    assert.equal(checkScreen(`${bad} // allow-component:wait 別のid`).length, 1, bad);
  }
  for (const ok of ["el.className = 'sk-screen-board';", "el.dataset.skScreen = 'frame';", "// className = 'status-bar' の説明", 'const statusBar = 1;']) {
    assert.deepEqual(checkScreen(ok), [], ok);
  }
  assert.ok(Object.hasOwn(sources, SCREEN));
});

test('ダミー：CRLF の行に付いた allow-component:screen も緑（#343-11A）', () => {
  const bad = "el.className = 'board-area flex-1'; // allow-component:screen 結果の星を盤面に重ねる別骨格";
  assert.deepEqual(checkScreen(`${bad}\r\nconst a = 1;\r\n`), [], 'CRLF');
  assert.equal(checkScreen("el.className = 'board-area flex-1';\r\n").length, 1, 'CRLF・理由なし');
});

// ---- 件数の基準の赤緑（ダミーの登録表・ソース・基準で判定そのものを通す）----
const reg = [
  { id: 'aa', 部品: 'クリア演出', 項目: 'a', 対象: ['js/'], 検出: (f, s) => s.split('\n').flatMap((l, i) => (/BAD/.test(l) && !/\/\/\s*allow-component:aa\s+\S/.test(l) ? [i + 1] : [])) },
  { id: 'bb', 部品: 'クリア演出', 項目: 'b', 対象: ['js/', 'x.css'], 検出: (f, s) => s.split('\n').flatMap((l, i) => (/WORSE/.test(l) ? [i + 1] : [])) },
];
const exc = [{ file: 'js/ex.js', 理由: 'テスト' }];
const base = (o = {}) => ({
  patterns: { aa: 1, bb: 0 },
  allow: { aa: 0, bb: 0 },
  excluded: { 'js/ex.js': { aa: 1, bb: 0 } },
  ...o,
});
const srcs = (o = {}) => ({ 'js/a.js': 'BAD\nok\n', 'js/ex.js': 'BAD\n', 'js/ui-clear.js': 'BAD\n', ...o });
const run = (s, b) => judge(measure(s, reg, exc), b, reg, exc);

test('ダミー：基準どおりなら緑（ui-clear.js は数えない・除外ファイルは excluded に数える）', () => {
  assert.deepEqual(run(srcs(), base()), []);
  const m = measure(srcs(), reg, exc);
  assert.deepEqual(m.patterns, { aa: 1, bb: 0 });
  assert.deepEqual(m.excluded, { 'js/ex.js': { aa: 1, bb: 0 } });
});

test('ダミー：基準より増えたら赤、減って基準が据え置きでも赤（失敗文言に基準と実際を含む）', () => {
  const up = run(srcs({ 'js/b.js': 'BAD\n' }), base());
  assert.equal(up.length, 1);
  assert.match(up[0], /^aa: 基準1→実際2/);
  const down = run(srcs({ 'js/a.js': 'ok\n' }), base());
  assert.deepEqual(down, ['aa: 基準1→実際0。下げるなら基準を0に']);
  assert.deepEqual(run(srcs({ 'js/a.js': 'ok\n' }), base({ patterns: { aa: 0, bb: 0 } })), []);
  const css = run(srcs({ 'x.css': 'WORSE\n' }), base());
  assert.equal(css.length, 1);
  assert.match(css[0], /^bb: 基準0→実際1/);
});

test('ダミー：除外ファイルの中の増加・減少も赤', () => {
  const up = run(srcs({ 'js/ex.js': 'BAD\nBAD\n' }), base());
  assert.equal(up.length, 1);
  assert.match(up[0], /^excluded js\/ex\.js aa: 基準1→実際2/);
  assert.deepEqual(run(srcs({ 'js/ex.js': 'ok\n' }), base()), ['excluded js/ex.js aa: 基準1→実際0。下げるなら基準を0に']);
});

test('ダミー：allow-component は理由があれば数えて allow の基準と比べる（増減とも赤）', () => {
  const withAllow = srcs({ 'js/a.js': 'BAD // allow-component:aa 理由あり\n' });
  assert.deepEqual(run(withAllow, base({ patterns: { aa: 0, bb: 0 }, allow: { aa: 1, bb: 0 } })), []);
  const up = run(withAllow, base({ patterns: { aa: 0, bb: 0 } }));
  assert.equal(up.length, 1);
  assert.match(up[0], /^allow aa: 基準0→実際1/);
  const down = run(srcs(), base({ allow: { aa: 1, bb: 0 } }));
  assert.deepEqual(down, ['allow aa: 基準1→実際0。下げるなら基準を0に']);
});

test('ダミー：理由なし・id 不明・形違いの allow-component は赤、旧 allow-clear は赤', () => {
  for (const bad of ['BAD // allow-component:aa', 'BAD // allow-component:aa   ', 'x // allow-component:zz 理由', 'x // allow-component: 理由', 'x /* allow-component:aa */', 'x allow-component:aa 理由']) {
    const r = run(srcs({ 'js/a.js': `${bad}\n` }), base());
    assert.ok(r.some((m) => /allow-component/.test(m)), `${bad} → ${r}`);
  }
  const old = run(srcs({ 'js/a.js': 'BAD // allow-clear: 理由\n' }), base());
  assert.ok(old.some((m) => /旧 allow-clear/.test(m)));
  const cssOk = run(srcs({ 'x.css': '.a { width: 20px; } /* allow-component:bb 理由 */\n' }), base({ allow: { aa: 0, bb: 1 } }));
  assert.deepEqual(cssOk, []);
});

test('ダミー：基準ファイルの登録表に無い id・欠けた id・負や整数でない値は赤', () => {
  const bads = [
    base({ patterns: { aa: 1, bb: 0, cc: 0 } }),
    base({ patterns: { aa: 1 } }),
    base({ patterns: { aa: -1, bb: 0 } }),
    base({ patterns: { aa: 1.5, bb: 0 } }),
    base({ patterns: { aa: '1', bb: 0 } }),
    base({ patterns: { aa: null, bb: 0 } }),
    base({ allow: { aa: 0 } }),
    base({ allow: { aa: 0, bb: 0, zz: 0 } }),
    base({ allow: { aa: 0, bb: -2 } }),
    base({ excluded: {} }),
    base({ excluded: { 'js/ex.js': { aa: 1 } } }),
    base({ excluded: { 'js/ex.js': { aa: 1, bb: 0, cc: 0 } } }),
    base({ excluded: { 'js/ex.js': { aa: 1, bb: -1 } } }),
    base({ excluded: { 'js/ex.js': { aa: 1, bb: 0 }, 'js/other.js': { aa: 0, bb: 0 } } }),
    { patterns: { aa: 1, bb: 0 }, allow: { aa: 0, bb: 0 } },
  ];
  for (const b of bads) assert.ok(run(srcs(), b).length > 0, JSON.stringify(b));
});

test('ダミー：部品の置き場は、その部品の id だけを数えない（互いの id は数える）', () => {
  const regs = [
    { id: 'aa', 部品: 'クリア演出', 項目: 'a', 対象: ['js/'], 検出: (f, s) => (s.includes('BAD') ? [1] : []) },
    { id: 'screen', 部品: '操作画面の枠', 項目: 's', 対象: ['js/'], 検出: (f, s) => (s.includes('OLD') ? [1] : []) },
  ];
  const m = measure({ 'js/ui-screen.js': 'BAD OLD\n', 'js/ui-clear.js': 'BAD OLD\n', 'js/x.js': 'ok\n' }, regs, []);
  // ui-screen.js は screen を数えず aa を数える／ui-clear.js は aa を数えず screen を数える
  assert.deepEqual(m.patterns, { aa: 1, screen: 1 });
  const none = measure({ 'js/x.js': 'BAD OLD\n' }, regs, []);
  assert.deepEqual(none.patterns, { aa: 1, screen: 1 });
});
