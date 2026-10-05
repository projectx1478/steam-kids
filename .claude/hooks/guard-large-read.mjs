// guard-large-read.mjs: PreToolUse(Read|Bash)。300行を超えるファイルの丸ごと読み込みを拒否する（Issue #300）。
// - Read: offset・limitのどちらも無い呼び出しを拒否（画像・PDF・ノートブック・バイナリは対象外）
// - Bash: cat / Get-Content / gc / type の単純な丸ごと出力を拒否（パイプ・リダイレクト・-TotalCount等の範囲指定は許可）
// 拒否はJSON出力（permissionDecision: "deny"。公式: https://code.claude.com/docs/en/hooks）。
// 既存のcheck-file-size.sh（警告のみ・allow）とは並列で動き、denyが1つでもあれば拒否される。
// どんな失敗でも読み込みを止めない（例外時は何も出さず終了＝判断なし）。
import { readFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';

const MAX_LINES = 300;
const SKIP_EXT = /\.(png|jpe?g|gif|webp|bmp|ico|pdf|ipynb|svgz?|woff2?|ttf|zip|gz|mp[34]|wav)$/i;
const READ_CMD = /^(cat|get-content|gc|type)\s+(.+)$/i;
const RANGE_FLAG = /^-(totalcount|first|head|tail|last)$/i;

function resolveFile(p, cwd) {
  let f = p.replace(/^\/([a-zA-Z])\/(.*)$/, '$1:/$2'); // Git Bash形式 /c/Users/... → C:/Users/...
  if (!path.isAbsolute(f)) f = path.resolve(cwd || process.cwd(), f);
  return f;
}

// 300行を超えるテキストファイルなら行数を返す（それ以外はnull）。
function bigLineCount(file) {
  if (SKIP_EXT.test(file) || !existsSync(file) || !statSync(file).isFile()) return null;
  const buf = readFileSync(file);
  if (buf.includes(0)) return null; // バイナリ
  let n = 0;
  for (const b of buf) if (b === 10) n += 1;
  return n > MAX_LINES ? n : null;
}

function deny(reason) {
  console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } }));
}

const advice = (file, n) =>
  `${path.basename(file)} は${n}行あり、全文は読めません（${MAX_LINES}行超）。` +
  `grep -n で位置を出し、Readは offset/limit、Bashは sed -n 'a,bp' や head/tail で必要な範囲だけ読んでください（AGENTS.md トークン方針）。`;

function checkBash(command, cwd) {
  for (const raw of command.split(/&&|;|\n/)) {
    const seg = raw.trim();
    if (!seg || /[|<>]/.test(seg)) continue; // パイプ・リダイレクト・ヒアドキュメントは対象外
    const m = READ_CMD.exec(seg);
    if (!m) continue;
    const tokens = m[2].match(/"[^"]*"|'[^']*'|\S+/g) ?? [];
    if (tokens.some((t) => RANGE_FLAG.test(t))) continue;
    for (const t of tokens) {
      if (t.startsWith('-')) continue;
      const name = t.replace(/^["']|["']$/g, '');
      if (/[$*?~`]/.test(name)) continue; // 変数・グロブは解決しない
      const file = resolveFile(name, cwd);
      const n = bigLineCount(file);
      if (n) return advice(file, n);
    }
  }
  return null;
}

try {
  const input = JSON.parse(readFileSync(0, 'utf-8'));
  const { tool_name: tool, tool_input: ti = {}, cwd } = input;
  let reason = null;
  if (tool === 'Read' && ti.file_path && ti.offset === undefined && ti.limit === undefined && !ti.pages) {
    const file = resolveFile(ti.file_path, cwd);
    const n = bigLineCount(file);
    if (n) reason = advice(file, n);
  } else if (tool === 'Bash' && typeof ti.command === 'string') {
    reason = checkBash(ti.command, cwd);
  }
  if (reason) deny(reason);
} catch {
  // 判断しない（フックの不具合で作業を止めない）
}
