// 色の点検ツール（Issue #383）。既定・--json は報告のみ（終了コード 0）。
// 使い方：node tools/color-audit.mjs [--json | --strict]
// --strict（#807）：計算済みで pass:false の子ども・共通 scope の行が1件でもあれば標準エラーに出して終了コード1（--json より優先）。
// 3表：textPairs（js・index.html のクラス文字列）／cssPairs（tailwind.src.css）／meaningPairs（色で意味を分ける組み合わせ）。
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

// ---------- 純粋関数 ----------
const NAMED = { white: [255, 255, 255], black: [0, 0, 0] };

export function parseColor(str) {
  if (typeof str !== 'string') return null;
  const s = str.trim().toLowerCase();
  if (NAMED[s]) return { r: NAMED[s][0], g: NAMED[s][1], b: NAMED[s][2], a: 1 };
  let m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(s);
  if (m) {
    const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: 1 };
  }
  m = /^rgba?\(\s*(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)\s*(?:[/,]\s*(.*?))?\s*\)$/.exec(s);
  if (m) {
    const alpha = m[4] === undefined ? NaN : Number(m[4]);
    return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]), a: Number.isFinite(alpha) ? alpha : 1 };
  }
  return null;
}

const toRgb = (c) => {
  const p = typeof c === 'string' ? parseColor(c) : c;
  if (!p) throw new Error(`色を解釈できない: ${JSON.stringify(c)}`);
  return p;
};
const lin = (v) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const luminance = ({ r, g, b }) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);

export function contrastRatio(fg, bg) {
  const l1 = luminance(toRgb(fg));
  const l2 = luminance(toRgb(bg));
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

export const isLargeText = (px, bold) => px >= 24 || (bold && px >= 18.66);
export const threshold = (px, bold) => (isLargeText(px, bold) ? 3.0 : 4.5);

// Machado 2009, severity 1.0（線形RGBに掛ける）
const CVD = {
  protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]],
};
const delin = (v) => { const c = Math.min(1, Math.max(0, v)); return c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055; };

export function simulateCvd(color, type) {
  const M = CVD[type];
  if (!M) throw new Error(`type は 'protan' か 'deutan': ${type}`);
  const { r, g, b } = toRgb(color);
  const v = [lin(r), lin(g), lin(b)];
  const out = M.map((row) => Math.round(delin(row[0] * v[0] + row[1] * v[1] + row[2] * v[2]) * 255));
  return { r: out[0], g: out[1], b: out[2] };
}

function toLab({ r, g, b }) {
  const R = lin(r), G = lin(g), B = lin(b);
  const X = (0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / 0.95047;
  const Y = 0.2126729 * R + 0.7151522 * G + 0.0721750 * B;
  const Z = (0.0193339 * R + 0.1191920 * G + 0.9503041 * B) / 1.08883;
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const fx = f(X), fy = f(Y), fz = f(Z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export function deltaE(c1, c2) {
  const a = toLab(toRgb(c1)), b = toLab(toRgb(c2));
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

// ---------- 色の値の取得（style.css から） ----------
const hex = ({ r, g, b }) => '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
const round = (v, n) => Math.round(v * 10 ** n) / 10 ** n;

function loadClassColors(css) {
  const map = new Map();
  const re = /\.((?:bg|text)-(?:white|black|[a-z]+-\d{2,3}))\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(css))) {
    const prop = m[1].startsWith('bg-') ? 'background-color' : 'color';
    const d = new RegExp(`(?:^|;)${prop}:(rgb\\([^)]*\\)|#[0-9a-fA-F]{3,6})`).exec(m[2]);
    if (d) map.set(m[1], parseColor(d[1]));
  }
  return map;
}

const SIZES = { xs: 12, sm: 14, base: 16, lg: 18, xl: 20, '2xl': 24, '3xl': 30, '4xl': 36 };
const GUARDIAN = new Set(['ui-dashboard.js', 'ui-sync.js', 'ui-parental-gate.js', 'ui-gate.js', 'guardian.js']);
const FG_RE = /^text-(white|black|[a-z]+-\d{2,3})(\/\d+)?$/;
const BG_RE = /^bg-(white|[a-z]+-\d{2,3})(\/\d+)?$/;
const SIZE_RE = /^text-(xs|sm|base|lg|xl|2xl|3xl|4xl)$/;
const STR_RE = /'([^'\\\n]*)'|"([^"\\\n]*)"|`([^`\\\n]*)`/g;

function makeRow({ file, line, fg, bg, px, scope, note = '', selector }) {
  const row = { file, line, ...(selector ? { selector } : {}), fg: fg ? hex(fg) : null, bg: bg ? hex(bg) : null, px };
  const need = threshold(px, true);
  if (fg && bg && !note) {
    row.ratio = round(contrastRatio(fg, bg), 2);
    row.need = need;
    row.pass = row.ratio >= need;
  } else {
    row.ratio = null; row.need = need; row.pass = null;
  }
  row.scope = scope;
  row.note = note;
  return row;
}

export function auditTextPairs(root = ROOT) {
  const colors = loadClassColors(readFileSync(join(root, 'style.css'), 'utf-8'));
  const files = [];
  for (const dir of ['js', 'js/gimmicks']) {
    for (const f of readdirSync(join(root, dir)).sort()) if (f.endsWith('.js')) files.push(`${dir}/${f}`);
  }
  files.push('index.html');
  const rows = [];
  for (const file of files) {
    const base = file.split('/').pop();
    const scope = GUARDIAN.has(base) ? '保護者' : '子ども';
    readFileSync(join(root, file), 'utf-8').split('\n').forEach((text, i) => {
      for (const m of text.matchAll(STR_RE)) {
        const tokens = (m[1] ?? m[2] ?? m[3] ?? '').split(/\s+/);
        const fgTok = tokens.find((t) => FG_RE.test(t));
        const bgToks = tokens.filter((t) => BG_RE.test(t));
        if (!fgTok || !bgToks.length) continue;
        const sizeTok = tokens.find((t) => SIZE_RE.test(t));
        const px = sizeTok ? SIZES[sizeTok.slice(5)] : 16;
        for (const bgTok of bgToks) {
          const fgName = fgTok.split('/')[0], bgName = bgTok.split('/')[0];
          const fg = colors.get(fgName), bg = colors.get(bgName);
          let note = '';
          if (fgTok.includes('/') || bgTok.includes('/')) note = '不透明度付き（要目視）';
          else if (!fg || !bg) note = 'style.css に無い';
          rows.push(makeRow({ file, line: i + 1, fg, bg, px, scope, note }));
        }
      }
    });
  }
  return rows;
}

const fontPx = (body) => {
  const m = /font-size\s*:\s*([\d.]+)(px|rem)/.exec(body);
  return m ? Number(m[1]) * (m[2] === 'rem' ? 16 : 1) : 16;
};

export function auditCssPairs(root = ROOT) {
  // コメントは行数を保ったまま空白にする（セレクタに混ざらないように）
  const src = readFileSync(join(root, 'tailwind.src.css'), 'utf-8').replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '));
  const rows = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(src))) {
    const body = m[2];
    const colorM = /(?:^|[;\s])color\s*:\s*([^;]+)/.exec(body);
    if (!colorM) continue;
    const fg = parseColor(colorM[1]);
    if (!fg) continue;
    const bgM = /(?:^|[;\s])background(?:-color)?\s*:\s*([^;]+)/.exec(body);
    const bg = bgM ? parseColor(bgM[1]) : null;
    const lead = m[1].length - m[1].trimStart().length;
    const line = src.slice(0, m.index + lead).split('\n').length;
    const selector = m[1].trim().replace(/\s+/g, ' ');
    const px = fontPx(body);
    const base = { file: 'tailwind.src.css', line, selector, fg, px, scope: '共通' };
    if (bg) rows.push(makeRow({ ...base, bg, note: bg.a < 1 ? '透明度あり（要目視）' : '' }));
    else rows.push(makeRow({ ...base, bg: null, note: bgM ? '背景は単色でない（要目視）' : '背景は親（要目視）' }));
  }
  return rows;
}

// ---------- 色で意味を分けている組み合わせ（固定表） ----------
export const MEANING_TABLE = [
  ['key-red-blue', 'js/gimmicks/keys.js かぎ・ドア', '#ef4444', '#3b82f6', '丸／三角（mark）'],
  ['switch-red-blue', 'js/gimmicks/switches.js スイッチ・壁', '#ef4444', '#3b82f6', '丸／三角（mark）'],
  ['warp-1-2', 'js/gimmicks/warps.js', '#7e22ce', '#ea580c', '星／四角'],
  ['periodic-blue-red', 'js/gimmicks/periodic.js', '#0072B2', '#D55E00', '丸／四角（MARK_SHAPE）'],
  ['periodic-blue-yellow', 'js/gimmicks/periodic.js', '#0072B2', '#F0E442', '丸／三角'],
  ['periodic-red-yellow', 'js/gimmicks/periodic.js', '#D55E00', '#F0E442', '四角／三角'],
  ['paint-done-todo', 'js/gimmicks/paint.js 塗った／まだ', '#fcd34d', '#f5f5f4', 'なし'],
  ['step-done-todo', 'js/ui-step.js 点列 済み／まだ', '#34d399', '#e2e8f0', '✓バッジ'],
  ['step-current-done', 'js/ui-step.js 点列 いま／済み', '#0ea5e9', '#34d399', 'ring-2 の輪'],
  ['unit-commands-teko', 'js/ui-picker.js 単元色', '#34d399', '#2dd4bf', '単元アイコン'],
  ['unit-keys-ice', 'js/ui-picker.js 単元色', '#c084fc', '#38bdf8', '単元アイコン'],
  ['unit-switches-teko', 'js/ui-picker.js 単元色', '#fb7185', '#2dd4bf', '単元アイコン'],
  ['unit-commands-donguri', 'js/ui-picker.js 単元色', '#34d399', '#fbbf24', '単元アイコン'],
];

export function auditMeaningPairs() {
  return MEANING_TABLE.map(([id, place, a, b, cue]) => {
    const normal = deltaE(a, b);
    const protan = deltaE(simulateCvd(a, 'protan'), simulateCvd(b, 'protan'));
    const deutan = deltaE(simulateCvd(a, 'deutan'), simulateCvd(b, 'deutan'));
    const hard = Math.min(normal, protan, deutan) < 20;
    return {
      id, place, a, b,
      normal: round(normal, 1), protan: round(protan, 1), deutan: round(deutan, 1),
      cue, hard, mustFix: hard && cue === 'なし',
    };
  });
}

// ---------- CLI ----------
const cell = (v) => String(v ?? '').replace(/\|/g, '\\|');
const table = (head, rows) => [
  `| ${head.join(' | ')} |`,
  `|${head.map(() => '---').join('|')}|`,
  ...rows.map((r) => `| ${r.map(cell).join(' | ')} |`),
].join('\n');

export function toMarkdown({ textPairs, cssPairs, meaningPairs }) {
  const calc = textPairs.filter((r) => r.pass !== null);
  const fails = textPairs.filter((r) => r.pass === false);
  const kidFails = fails.filter((r) => r.scope === '子ども');
  const out = [];
  out.push('## textPairs（JS・HTML のクラス文字列）');
  out.push(`計算した ${calc.length} 件（全 ${textPairs.length} 行、要目視・未計算 ${textPairs.length - calc.length} 件）のうち AA 未満 ${fails.length} 件（子ども ${kidFails.length}／保護者 ${fails.length - kidFails.length}）。以下は AA 未満の行のみ。`);
  out.push('');
  out.push(table(['file', 'line', 'fg', 'bg', 'px', 'ratio', 'need', 'scope'],
    fails.map((r) => [r.file, r.line, r.fg, r.bg, r.px, r.ratio, r.need, r.scope])));
  out.push('', '## cssPairs（tailwind.src.css）', '');
  out.push(table(['line', 'selector', 'fg', 'bg', 'px', 'ratio', 'need', 'pass', 'note'],
    cssPairs.map((r) => [r.line, r.selector, r.fg, r.bg, r.px, r.ratio, r.need, r.pass, r.note])));
  out.push('', '## meaningPairs（色で意味を分ける組み合わせ。ΔE<20 を区別しにくいとする）', '');
  out.push(table(['id', '色A', '色B', '通常', 'protan', 'deutan', 'cue', '判定'],
    meaningPairs.map((r) => [r.id, r.a, r.b, r.normal, r.protan, r.deutan, r.cue, r.mustFix ? '要修正' : r.hard ? '区別しにくい（cueあり）' : 'OK'])));
  const must = meaningPairs.filter((r) => r.mustFix).length;
  out.push('', `要修正（区別しにくい＋cue なし）：${must} 件`);
  return out.join('\n') + '\n';
}

// --strict の対象：計算済み（pass:false）で、保護者 scope を除く行（cssPairs は共通）。要目視・未計算・meaningPairs は数えない
export function strictFailures({ textPairs, cssPairs }) {
  return [...textPairs, ...cssPairs].filter((r) => r.pass === false && r.scope !== '保護者');
}

export function runAudit(root = ROOT) {
  return { textPairs: auditTextPairs(root), cssPairs: auditCssPairs(root), meaningPairs: auditMeaningPairs() };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const result = runAudit();
  if (process.argv.includes('--strict')) {
    const bad = strictFailures(result);
    for (const r of bad) console.error(`${r.file}:${r.line} ${r.fg} ${r.bg} ${r.ratio} need ${r.need}`);
    if (bad.length) console.error(`color-audit --strict: FAIL ${bad.length} 件`);
    process.exit(bad.length ? 1 : 0);
  }
  process.stdout.write(process.argv.includes('--json') ? JSON.stringify(result, null, 2) + '\n' : toMarkdown(result));
}
