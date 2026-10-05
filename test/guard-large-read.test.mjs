// .claude/hooks/guard-large-read.mjs（Issue #300）：300行超の全文読み込みを拒否し、範囲指定・短いファイル・非テキストは通す。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

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
