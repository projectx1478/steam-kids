// check-approved.mjs: approved.md の必須見出しの有無を確かめ、欠けを列挙して exit 1 にする。
//   node tools/check-approved.mjs <approved.md> [--draft] [--strict] [--worktree <dir>]
// 照合は行頭の前方一致（見出しの後ろに文が付いてもよい）。--draft は承認前の summary.md 用で、`承認:` 行の検査を外す。
// draft でないときは、HTML コメントと `...` を除いた本文に「未決」「要確認」を含む行、雛形の置き場所の印（<日付> など非ASCII入りの <...>）が残る行も欠けにする。
// 必須一覧は .claude/agents/reviewer.md の G1 と一致させる。
import { readFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HEADINGS = ['決定', '段の分け方', '実装時に守ること', 'E2E への影響', '検証コスト', '検証計画', '使う共通部品', '部品化の置き換え計画', '入力仕様', '状態遷移表', '文言の経路一覧', '事前点検', '止まりうる点と対処'];
// `実装時に守ること` の中に要る5項
const GUARD_ITEMS = ['範囲', '停止条件', '報告', 'PR規則', '事前許可'];

// 欠けの一覧（文字列の配列）を返す。空なら合格。
// draft または strict のときだけ、上位規則の行（検査1）と E2E の未確定語（検査2）も見る。
// worktree・mockRoot・notes は検査3・4（段2）用に受け取る。
export function checkApproved(text, { draft = false, strict = false, worktree, mockRoot, notes } = {}) {
  const lines = text.split(/\r?\n/);
  const missing = [];
  if (!draft && !lines.some((l) => l.startsWith('承認:'))) missing.push('承認: 行');
  if (!lines.some((l) => l.startsWith('見積もり:'))) missing.push('見積もり: 行');
  for (const h of HEADINGS) {
    if (!lines.some((l) => l.startsWith(`## ${h}`))) missing.push(`## ${h}`);
  }
  const start = lines.findIndex((l) => l.startsWith('## 実装時に守ること'));
  if (start >= 0) {
    let end = lines.findIndex((l, i) => i > start && l.startsWith('## '));
    if (end < 0) end = lines.length;
    const body = lines.slice(start + 1, end).filter((l) => /^\s*-/.test(l));
    for (const item of GUARD_ITEMS) {
      if (!body.some((l) => l.replace(/^\s*-\s*\**/, '').startsWith(item))) missing.push(`実装時に守ること／${item}`);
    }
  }
  if (!draft) missing.push(...findLeftovers(text));
  if (draft || strict) {
    missing.push(...checkSuperior(lines));
    missing.push(...checkE2eWords(lines));
  }
  return missing;
}

// `## <見出し>` の節の本文の範囲 [開始, 終了)（行の添字）。無ければ null。
function sectionRange(lines, heading) {
  const start = lines.findIndex((l) => l.startsWith(`## ${heading}`));
  if (start < 0) return null;
  let end = lines.findIndex((l, i) => i > start && l.startsWith('## '));
  if (end < 0) end = lines.length;
  return [start + 1, end];
}

const SUPERIOR_PATH = /(?<![A-Za-z0-9._/-])(?:docs\/|\.claude\/|AGENTS\.md)[^\s、。，,）)」・]*/g;
const SUPERIOR_MISSING = '上位規則の行（本文に「上位規則…。テンプレート同期の対象外…」）';

// 検査1: docs/・.claude/・AGENTS.md を触る設計には、上位規則とテンプレート同期の対象外を書いた行が要る。
function checkSuperior(lines) {
  const parts = [];
  const plan = sectionRange(lines, '段の分け方');
  if (plan) {
    for (const l of lines.slice(plan[0], plan[1])) if (/^\s*-\s*触る：/.test(l)) parts.push(l);
  }
  const guard = sectionRange(lines, '実装時に守ること');
  if (guard) {
    for (const l of lines.slice(guard[0], guard[1])) {
      if (!/^\s*-\s*範囲：/.test(l)) continue;
      const i = l.indexOf('触らない');
      parts.push(i >= 0 ? l.slice(0, i) : l);
    }
  }
  const needs = parts.some((p) => [...p.matchAll(SUPERIOR_PATH)].some((m) => !m[0].startsWith('.claude/verify/scenarios/')));
  if (!needs) return [];
  const ok = lines.some((l) => l.includes('上位規則') && /(テンプレート)?同期(の|は|：|:)?\s*対象外/.test(l));
  return ok ? [] : [SUPERIOR_MISSING];
}

const E2E_WORDS = ['足してよい', '足してもよい', '必要なら', '必要に応じ', '検討', 'かもしれ', '未定', 'TBD'];

// 検査2: 「E2E への影響」の節に未確定の語を残さない（バッククォートの中は見ない）。
function checkE2eWords(lines) {
  const r = sectionRange(lines, 'E2E への影響');
  if (!r) return [];
  const out = [];
  for (let i = r[0]; i < r[1]; i++) {
    const line = lines[i].replace(/`[^`]*`/g, '');
    for (const w of E2E_WORDS) {
      if (line.includes(w)) out.push(`E2E への影響に未確定の語「${w}」（${i + 1}行目）`);
    }
  }
  return out;
}

// 未決・要確認・雛形の置き場所の印が残る行を返す。行番号は元ファイルのまま（コメントは改行を残して除く）。
function findLeftovers(text) {
  const stripped = text.replace(/<!--[\s\S]*?-->/g, (c) => c.replace(/[^\n]/g, ''));
  const out = [];
  stripped.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.replace(/`[^`]*`/g, '');
    const marks = (line.match(/<[^<>/]*>/g) || []).some((m) => {
      const inner = m.slice(1, -1);
      return m === '<…>' || (inner.length >= 1 && /[^\x00-\x7f]/.test(inner));
    });
    if (/未決|要確認/.test(line) || marks) {
      missing_label(out, i + 1, raw);
    }
  });
  return out;
}

function missing_label(out, no, raw) {
  out.push(`未決の残り（${no}行目）: ${raw.slice(0, 40)}`);
}

function main() {
  const args = process.argv.slice(2);
  const usage = '使い方: node tools/check-approved.mjs <approved.md> [--draft] [--strict] [--worktree <dir>]';
  let draft = false;
  let strict = false;
  let worktree;
  let file;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--draft') draft = true;
    else if (a === '--strict') strict = true;
    else if (a === '--worktree') {
      const v = args[i + 1];
      if (v === undefined || v.startsWith('--')) {
        console.error('--worktree には値（ディレクトリ）が要る');
        process.exit(2);
      }
      worktree = v;
      i++;
    } else if (!a.startsWith('--') && file === undefined) file = a;
  }
  if (!file) {
    console.error(usage);
    process.exit(2);
  }
  if (worktree !== undefined && !(existsSync(worktree) && statSync(worktree).isDirectory())) {
    console.error(`--worktree のディレクトリが無い: ${worktree}`);
    process.exit(2);
  }
  const notes = [];
  if ((draft || strict) && worktree === undefined) notes.push('--worktree が無いので path:行 の検査を省略');
  const missing = checkApproved(readFileSync(file, 'utf-8'), { draft, strict, worktree, mockRoot: process.cwd(), notes });
  for (const n of notes) console.error(`注: ${n}`);
  if (missing.length) {
    console.error(`欠け ${missing.length} 件（${file}）:`);
    for (const m of missing) console.error(`  - ${m}`);
    process.exit(1);
  }
  console.log(`OK: ${file}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
