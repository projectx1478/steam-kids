// check-approved.mjs: approved.md の必須見出しの有無を確かめ、欠けを列挙して exit 1 にする。
//   node tools/check-approved.mjs <approved.md> [--draft]
// 照合は行頭の前方一致（見出しの後ろに文が付いてもよい）。--draft は承認前の summary.md 用で、`承認:` 行の検査を外す。
// 必須一覧は .claude/agents/reviewer.md の G1 と一致させる。
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HEADINGS = ['決定', '段の分け方', '実装時に守ること', 'E2E への影響', '検証コスト', '検証計画', '使う共通部品', '部品化の置き換え計画', '入力仕様', '状態遷移表', '文言の経路一覧'];
// `実装時に守ること` の中に要る5項
const GUARD_ITEMS = ['範囲', '停止条件', '報告', 'PR規則', '事前許可'];

// 欠けの一覧（文字列の配列）を返す。空なら合格。
export function checkApproved(text, { draft = false } = {}) {
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
  return missing;
}

function main() {
  const args = process.argv.slice(2);
  const draft = args.includes('--draft');
  const file = args.find((a) => !a.startsWith('--'));
  if (!file) {
    console.error('使い方: node tools/check-approved.mjs <approved.md> [--draft]');
    process.exit(2);
  }
  const missing = checkApproved(readFileSync(file, 'utf-8'), { draft });
  if (missing.length) {
    console.error(`欠け ${missing.length} 件（${file}）:`);
    for (const m of missing) console.error(`  - ${m}`);
    process.exit(1);
  }
  console.log(`OK: ${file}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
