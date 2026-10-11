// .githooks/commit-msg：「Co-Authored-By: Claude」入りのメッセージを拒否し、それ以外は通す。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const hook = join(import.meta.dirname, '..', '.githooks', 'commit-msg');

function run(message) {
  const dir = mkdtempSync(join(tmpdir(), 'commit-msg-'));
  const file = join(dir, 'MSG');
  writeFileSync(file, message);
  try {
    return spawnSync('bash', [hook, file], { encoding: 'utf8' });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('Co-Authored-By: Claude を含むと拒否する（大文字小文字不問）', () => {
  for (const line of ['Co-Authored-By: Claude <noreply@anthropic.com>', 'co-authored-by: claude']) {
    const r = run(`feat: 追加\n\n${line}\n`);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /Co-Authored-By: Claude/);
  }
});

test('それ以外のメッセージは通す', () => {
  assert.equal(run('feat: 追加 (#1)\n').status, 0);
  assert.equal(run('feat: 追加\n\nCo-Authored-By: 悠 <a@example.com>\n').status, 0);
});
