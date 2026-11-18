// .claude/hooks/guard-large-read.mjs（Issue #300）：300行超の全文読み込みを拒否し、範囲指定・短いファイル・非テキストは通す。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { countLinesUpTo } from '../.claude/hooks/guard-large-read.mjs';

const dir = mkdtempSync(path.join(tmpdir(), 'guard-'));
const big = path.join(dir, 'big.txt');
const small = path.join(dir, 'small.txt');
const png = path.join(dir, 'pic.png');
writeFileSync(big, Array.from({ length: 301 }, (_, i) => `line ${i}`).join('\n') + '\n');
writeFileSync(small, 'a\nb\n');
writeFileSync(png, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0]));

function run(tool, toolInput) {
  const r = spawnSync(process.execPath, ['.claude/hooks/guard-large-read.mjs'], {
    input: JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: tool, tool_input: toolInput, cwd: dir }),
    encoding: 'utf-8',
  });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim() ? JSON.parse(r.stdout).hookSpecificOutput : null;
}
const denied = (o) => o && o.permissionDecision === 'deny' && /grep -n/.test(o.permissionDecisionReason);

test('guard: Read は300行超かつ offset/limit なしを拒否し、指定ありや短いファイル・画像は通す', () => {
  assert.ok(denied(run('Read', { file_path: big })));
  assert.equal(run('Read', { file_path: big, offset: 10, limit: 50 }), null);
  assert.equal(run('Read', { file_path: big, limit: 50 }), null);
  assert.equal(run('Read', { file_path: small }), null);
  assert.equal(run('Read', { file_path: png }), null);
  assert.equal(run('Read', { file_path: path.join(dir, 'none.txt') }), null);
});

test('guard: Bash の cat / Get-Content による丸ごと出力を拒否する', () => {
  assert.ok(denied(run('Bash', { command: `cat "${big}"` })));
  assert.ok(denied(run('Bash', { command: `cd x && cat ${big}` })));
  assert.ok(denied(run('Bash', { command: `Get-Content -Encoding UTF8 "${big}"` })));
  assert.ok(denied(run('Bash', { command: `gc ${big}` })));
});

test('guard: Bash の範囲指定・パイプ・リダイレクト・短いファイルは通す', () => {
  assert.equal(run('Bash', { command: `sed -n 1,40p ${big}` }), null);
  assert.equal(run('Bash', { command: `head -20 ${big}` }), null);
  assert.equal(run('Bash', { command: `tail -5 ${big}` }), null);
  assert.equal(run('Bash', { command: `grep -n line ${big}` }), null);
  assert.equal(run('Bash', { command: `cat ${big} | head -5` }), null);
  assert.equal(run('Bash', { command: `Get-Content ${big} -TotalCount 20` }), null);
  assert.equal(run('Bash', { command: `cat > ${path.join(dir, 'out.txt')} <<'EOF'\nx\nEOF` }), null);
  assert.equal(run('Bash', { command: `cat ${small}` }), null);
  assert.equal(run('Bash', { command: 'git --no-pager status' }), null);
});

test('guard: 壊れた入力でも何も出さず正常終了する', () => {
  const r = spawnSync(process.execPath, ['.claude/hooks/guard-large-read.mjs'], { input: 'not json', encoding: 'utf-8' });
  assert.equal(r.status, 0);
  assert.equal(r.stdout.trim(), '');
});

test('guard: cd後の相対パスを cd 先基準で解決する', () => {
  const d2 = mkdtempSync(path.join(tmpdir(), 'guard-cd-')); // d2/big.txt は存在しない（sub/big.txt だけ）
  mkdirSync(path.join(d2, 'sub'));
  writeFileSync(path.join(d2, 'sub', 'big.txt'), Array.from({ length: 301 }, (_, i) => `line ${i}`).join('\n') + '\n');
  const runIn = (command) => {
    const r = spawnSync(process.execPath, ['.claude/hooks/guard-large-read.mjs'], {
      input: JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command }, cwd: d2 }),
      encoding: 'utf-8',
    });
    return r.stdout.trim() ? JSON.parse(r.stdout).hookSpecificOutput : null;
  };
  assert.ok(denied(runIn('cd sub && cat big.txt')));
  assert.equal(runIn('cd sub && sed -n 1,40p big.txt'), null);
  assert.equal(runIn('cat big.txt'), null);
  assert.equal(runIn('cd sub | cat big.txt'), null);
});

test('countLinesUpTo: 上限超で打ち切り、短いファイルは全体を読む', () => {
  const many = path.join(dir, 'many.txt');
  writeFileSync(many, Array.from({ length: 10000 }, (_, i) => `line ${i}`).join('\n') + '\n');
  const r = countLinesUpTo(many, 300);
  assert.equal(r.lines, 301);
  assert.ok(r.bytesRead < statSync(many).size);
  const s = countLinesUpTo(small, 300);
  assert.equal(s.lines, 2);
  assert.equal(s.bytesRead, statSync(small).size);
  assert.equal(countLinesUpTo(png, 300).binary, true);
});
