// 禁止パターンの登録表（Issue #349・docs/components.md）。検査の判定は test/forbidden-patterns.test.mjs、
// 件数の基準は test/forbidden-baseline.json。項目を足すときは、ここに1行足し、基準ファイルに同じ id を足す。
// 例外は該当行の行末コメント `// allow-component:<id> 理由`（CSS は `/* allow-component:<id> 理由 */`）。理由は必須。

export const CLEAR = 'js/ui-clear.js'; // クリア演出の置き場
export const SCREEN = 'js/ui-screen.js'; // 操作画面の枠の置き場
// 部品の置き場：そのファイルでは、その部品（登録表の 部品）の id だけを数えない。ほかの部品の id は数える。
export const HOMES = { [CLEAR]: 'クリア演出', [SCREEN]: '操作画面の枠' };

// 検査の対象から外すファイル（理由1行つき）。最大2ファイル。増やすには悠さんの承認。
// 外したファイルの中の検出件数も数え、基準ファイルの excluded に記録する。
export const EXCLUDES = [
  { file: 'js/ui-summary.js', 理由: 'レッスン・単元の完了画面で、ステージ演出ではない' },
  { file: 'js/ui-demo.js', 理由: 'お手本デモで、クリアではない' },
];

const allowJs = (id) => new RegExp(`//\\s*allow-component:${id}\\s+\\S`);
const allowCss = (id) => new RegExp(`/\\*\\s*allow-component:${id}\\s+\\S`);

// 行単位で正規表現に当たる行番号を返す。該当 id の allow-component 付きの行は除く。
function lineHits(src, res, id) {
  const allow = allowJs(id);
  return src.split('\n').flatMap((line, i) => (res.some((re) => re.test(line)) && !allow.test(line) ? [i + 1] : []));
}

// コメントだけの行は読まない（新しい4項目用。説明文の中の関数名を数えないため）。
const isCommentLine = (line) => /^\s*(\/\/|\/\*|\*)/.test(line);
function callHits(src, res, id) {
  const allow = allowJs(id);
  return src.split('\n').flatMap((line, i) =>
    !isCommentLine(line) && res.some((re) => re.test(line)) && !allow.test(line) ? [i + 1] : [],
  );
}

const importsClear = (src) => /import\s[^;]*['"][^'"]*ui-clear(\.js)?['"]/.test(src);

// 1) ダイアログの自前生成（.show( はファイル単位では要素を区別できないので全部対象。誤検知は allow-component:dialog で逃がす）
const DIALOG_RES = [/createElement\(\s*['"]dialog['"]\s*\)/, /\.showModal\(/, /\.show\(/, /result-row/, /result-dialog/];
// 2) 待ち時間の直書き（ui-clear.js を import するファイルのみ）
const WAIT_RES = [/setTimeout\([^;]*,\s*(1500|1000)\s*\)/, /const\s+RESULT_GAP/];
// 3) 星サイズの直書き
const STAR_JS_RE = /style\.(width|height)\s*=\s*['"]20px['"]/;
const STAR_CSS_RE = /(?<![-\w])(width|height)\s*:\s*20px/;
// 4) 新しい4項目（定義行・import 行・コメント行は数えない）
const SHOWSUCCESS_RES = [/(?<!function\s+)\bshowSuccess\s*\(/];
const CONFETTI_RES = [/\.confetti\??\.?\(/, /(?<!function\s+)\bscreenConfetti\s*\(/];
const CLEARRECORD_RES = [/(?<!function\s+)\b(markLessonCleared|saveResumePoint)\s*\(/];
const CLEARLOG_RES = [/\blogEvent\(\s*['"](clear|stage_clear)['"]/];

// 5) 操作画面の枠の旧クラス名（className の行。コメント行は数えない）
const SCREEN_RES = [/className.*(?<![\w-])(play-screen|status-bar|board-area|controller-panel|action-row)(?![\w-])/];

export function checkDialog(src) {
  return lineHits(src, DIALOG_RES, 'dialog');
}
export function checkWait(src) {
  return importsClear(src) ? lineHits(src, WAIT_RES, 'wait') : [];
}
export function checkStarJs(src) {
  return lineHits(src, [STAR_JS_RE], 'star');
}
// tailwind.src.css：セレクタに .sk-clear- を含まないルールの中の width/height: 20px
export function checkStarCss(src) {
  const allow = allowCss('star');
  const text = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  const hits = [];
  for (const m of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (m[1].includes('.sk-clear-')) continue;
    const bodyStart = m.index + m[0].indexOf('{') + 1;
    const lines = m[2].split('\n');
    let offset = bodyStart;
    for (const line of lines) {
      if (STAR_CSS_RE.test(line) && !allow.test(src.slice(offset, offset + line.length))) {
        hits.push(text.slice(0, offset).split('\n').length);
      }
      offset += line.length + 1;
    }
  }
  return hits;
}
export function checkShowSuccess(src) {
  return callHits(src, SHOWSUCCESS_RES, 'showsuccess');
}
export function checkConfetti(src) {
  return callHits(src, CONFETTI_RES, 'confetti');
}
export function checkClearRecord(src) {
  return callHits(src, CLEARRECORD_RES, 'clearrecord');
}
export function checkClearLog(src) {
  return callHits(src, CLEARLOG_RES, 'clearlog');
}
export function checkScreen(src) {
  return callHits(src, SCREEN_RES, 'screen');
}

const JS = ['js/'];
// 登録表：{ id, 部品, 項目, 対象（先頭一致のパス。末尾 / 以外は完全一致）, 検出(file, src) → 行番号の配列 }
export const REGISTRY = [
  { id: 'dialog', 部品: 'クリア演出', 項目: 'ダイアログの自前生成', 対象: JS, 検出: (f, s) => checkDialog(s) },
  { id: 'wait', 部品: 'クリア演出', 項目: '待ち時間の直書き', 対象: JS, 検出: (f, s) => checkWait(s) },
  {
    id: 'star',
    部品: 'クリア演出',
    項目: '星サイズの直書き',
    対象: ['js/', 'tailwind.src.css'],
    検出: (f, s) => (f.endsWith('.css') ? checkStarCss(s) : checkStarJs(s)),
  },
  { id: 'showsuccess', 部品: 'クリア演出', 項目: 'showSuccess の直呼び', 対象: JS, 検出: (f, s) => checkShowSuccess(s) },
  { id: 'confetti', 部品: 'クリア演出', 項目: '紙吹雪の直呼び', 対象: JS, 検出: (f, s) => checkConfetti(s) },
  { id: 'clearrecord', 部品: 'クリア演出', 項目: 'クリア記録の直呼び', 対象: JS, 検出: (f, s) => checkClearRecord(s) },
  { id: 'clearlog', 部品: 'クリア演出', 項目: 'クリアログの直書き', 対象: JS, 検出: (f, s) => checkClearLog(s) },
  { id: 'screen', 部品: '操作画面の枠', 項目: '操作画面の枠の自前組み立て', 対象: JS, 検出: (f, s) => checkScreen(s) },
];

const inTarget = (file, targets) => targets.some((t) => (t.endsWith('/') ? file.startsWith(t) : file === t));

const zeros = (ids) => Object.fromEntries(ids.map((id) => [id, 0]));

// sources: { パス: ソース全文 }。件数を数える。
// patterns＝除外ファイルを除いた件数、excluded＝除外ファイルの中の件数、allow＝allow-component コメントの id ごとの件数。
export function measure(sources, registry = REGISTRY, excludes = EXCLUDES, homes = HOMES) {
  const ids = registry.map((r) => r.id);
  const patterns = zeros(ids);
  const allow = zeros(ids);
  const excluded = Object.fromEntries(excludes.map((e) => [e.file, zeros(ids)]));
  const errors = [];
  for (const [file, src] of Object.entries(sources)) {
    // allow-component コメントの数え上げと形の検査（旧 allow-clear は赤）
    src.split('\n').forEach((line, i) => {
      if (/allow-clear/.test(line)) errors.push(`${file}:${i + 1}: 旧 allow-clear が残っている（allow-component:<id> 理由 に直す）`);
      if (!line.includes('allow-component:')) return;
      const m = line.replace(/\r$/, '').match(/(?:\/\/|\/\*)\s*allow-component:([\w-]*)(\s.*)?$/);
      const id = m?.[1];
      const reason = (m?.[2] ?? '').replace(/\*\/\s*$/, '').trim();
      if (!m || !ids.includes(id)) errors.push(`${file}:${i + 1}: allow-component の id が登録表に無い、または形が違う`);
      else if (!reason) errors.push(`${file}:${i + 1}: allow-component:${id} に理由が無い`);
      else allow[id] += 1;
    });
    const ex = excluded[file];
    for (const r of registry) {
      if (homes[file] === r.部品) continue;
      if (!inTarget(file, r.対象)) continue;
      const n = r.検出(file, src).length;
      if (ex) ex[r.id] += n;
      else patterns[r.id] += n;
    }
  }
  return { patterns, allow, excluded, errors };
}

const isCount = (v) => typeof v === 'number' && Number.isInteger(v) && v >= 0;

// 基準ファイルの形を検査し、実測と比べる。返り値は失敗文言の配列（空なら緑）。
export function judge(measured, baseline, registry = REGISTRY, excludes = EXCLUDES) {
  const ids = registry.map((r) => r.id);
  const out = [...measured.errors];
  const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
  // 形の検査：キーの過不足と値の範囲
  const shape = (label, base, keys) => {
    if (!isObj(base)) {
      out.push(`基準ファイル: ${label} が無い、またはオブジェクトでない`);
      return false;
    }
    let ok = true;
    for (const k of Object.keys(base)) if (!keys.includes(k)) (ok = false), out.push(`基準ファイル: ${label} に登録表に無いキー ${k}`);
    for (const k of keys) if (!(k in base)) (ok = false), out.push(`基準ファイル: ${label} にキー ${k} が無い`);
    return ok;
  };
  const checkGroup = (label, base, actual) => {
    if (!shape(label, base, ids)) return;
    for (const id of ids) {
      const b = base[id];
      if (!isCount(b)) {
        out.push(`基準ファイル: ${label}.${id} は0以上の整数でなければならない（${JSON.stringify(b)}）`);
        continue;
      }
      const m = actual[id];
      const name = label === 'patterns' ? id : `${label} ${id}`;
      if (m > b) out.push(`${name}: 基準${b}→実際${m}。増えた：部品を使う（理由つきの allow-component:${id} か、悠さんの承認を得て基準を上げる）`);
      else if (m < b) out.push(`${name}: 基準${b}→実際${m}。下げるなら基準を${m}に`);
    }
  };
  checkGroup('patterns', baseline?.patterns, measured.patterns);
  checkGroup('allow', baseline?.allow, measured.allow);
  if (shape('excluded', baseline?.excluded, excludes.map((e) => e.file))) {
    for (const e of excludes) checkGroup(`excluded ${e.file}`, baseline.excluded[e.file], measured.excluded[e.file]);
  }
  return out;
}
