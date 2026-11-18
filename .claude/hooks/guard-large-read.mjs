// guard-large-read.mjs: PreToolUse(Read|Bash)。300行を超えるファイルの丸ごと読み込みを拒否する（steam-kids#300から配布。project-template#122）。
// - Read: offset・limitのどちらも無い呼び出しを拒否（画像・PDF・ノートブック・バイナリは対象外）
// - Bash: cat / Get-Content / gc / type の単純な丸ごと出力を拒否（パイプ・リダイレクト・-TotalCount等の範囲指定は許可）
// 拒否はJSON出力（permissionDecision: "deny"。公式: https://code.claude.com/docs/en/hooks）。
// 既存のcheck-file-size.sh（警告のみ・allow）とは並列で動き、denyが1つでもあれば拒否される。
// どんな失敗でも読み込みを止めない（例外時は何も出さず終了＝判断なし）。
import { readFileSync, existsSync, statSync, openSync, readSync, closeSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MAX_LINES = 300;
const SKIP_EXT = /\.(png|jpe?g|gif|webp|bmp|ico|pdf|ipynb|svgz?|woff2?|ttf|zip|gz|mp[34]|wav)$/i;
const READ_CMD = /^(cat|get-content|gc|type)\s+(.+)$/i;
const RANGE_FLAG = /^-(totalcount|first|head|tail|last)$/i;

function resolveFile(p, cwd) {
  let f = p.replace(/^\/([a-zA-Z])\/(.*)$/, '$1:/$2'); // Git Bash形式 /c/Users/... → C:/Users/...
  if (!path.isAbsolute(f)) f = path.resolve(cwd || process.cwd(), f);
  return f;
}

// 先頭から64KiBずつ読み、改行がlimitを超えた時点で打ち切る（巨大ファイルを丸ごとメモリへ載せない）。
// 戻り値: lines＝limitを超えた時点の数か全体の数、bytesRead＝読んだバイト数、binary＝0バイトを見つけたか。
export function countLinesUpTo(file, limit) {
  const CHUNK = 65536;
  const buf = Buffer.alloc(CHUNK);
  const fd = openSync(file, 'r');
  let lines = 0;
  let bytesRead = 0;
  try {
    for (;;) {
      const n = readSync(fd, buf, 0, CHUNK, null);
      if (n === 0) break;
      bytesRead += n;
      for (let i = 0; i < n; i += 1) {
        if (buf[i] === 0) return { lines, bytesRead, binary: true };
        if (buf[i] === 10) {
          lines += 1;
          if (lines > limit) return { lines, bytesRead, binary: false };
        }
      }
    }
  } finally {
    closeSync(fd);
  }
  return { lines, bytesRead, binary: false };
}

// 300行を超えるテキストファイルなら MAX_LINES + 1 を返す（それ以外はnull）。
function bigLineCount(file) {
  if (SKIP_EXT.test(file) || !existsSync(file) || !statSync(file).isFile()) return null;
  const { lines, binary } = countLinesUpTo(file, MAX_LINES);
  if (binary) return null;
  return lines > MAX_LINES ? lines : null;
}

function deny(reason) {
  console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } }));
}

const advice = (file) =>
  `${path.basename(file)} は${MAX_LINES}行を超えており、全文は読めません（${MAX_LINES}行超）。` +
  `grep -n で位置を出し、Readは offset/limit、Bashは sed -n 'a,bp' や head/tail で必要な範囲だけ読んでください（AGENTS.md トークン方針）。` +
  `全体構造の把握が必要なら、Readに offset: 1 と limit: <行数> を明示すれば読めます。`;

function checkBash(command, cwd) {
  let base = cwd || process.cwd();
  for (const raw of command.split(/&&|;|\n/)) {
    const seg = raw.trim();
    if (!seg || /[|<>]/.test(seg)) continue; // パイプ・リダイレクト・ヒアドキュメントは対象外（cdでもbaseは変えない）
    const cd = /^cd\s+(\S+)$/.exec(seg);
    if (cd) {
      const arg = cd[1].replace(/^["']|["']$/g, '');
      if (!/[$*?~`]/.test(arg) && !arg.startsWith('-')) base = resolveFile(arg, base);
      continue;
    }
    const m = READ_CMD.exec(seg);
    if (!m) continue;
    const tokens = m[2].match(/"[^"]*"|'[^']*'|\S+/g) ?? [];
    if (tokens.some((t) => RANGE_FLAG.test(t))) continue;
    for (const t of tokens) {
      if (t.startsWith('-')) continue;
      const name = t.replace(/^["']|["']$/g, '');
      if (/[$*?~`]/.test(name)) continue; // 変数・グロブは解決しない
      const file = resolveFile(name, base);
      const n = bigLineCount(file);
      if (n) return advice(file);
    }
  }
  return null;
}

function isMain() {
  try { return realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); } catch { return false; }
}

if (isMain()) {
  try {
    const input = JSON.parse(readFileSync(0, 'utf-8'));
    const { tool_name: tool, tool_input: ti = {}, cwd } = input;
    let reason = null;
    if (tool === 'Read' && ti.file_path && ti.offset === undefined && ti.limit === undefined && !ti.pages) {
      const file = resolveFile(ti.file_path, cwd);
      const n = bigLineCount(file);
      if (n) reason = advice(file);
    } else if (tool === 'Bash' && typeof ti.command === 'string') {
      reason = checkBash(ti.command, cwd);
    }
    if (reason) deny(reason);
  } catch {
    // 判断しない（フックの不具合で作業を止めない）
  }
}
