import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { push, pull, lock, unlock, start, drainInbox, LockConflict, UnsyncedEdit, LOCK_FILE } from '../tools/autopilot-state.mjs';

function setup() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-state-'));
  const repo = path.join(tmp, 'state.git');
  spawnSync('git', ['init', '--bare', '-b', 'main', repo]);
  const mk = (name) => {
    const dir = path.join(tmp, name);
    fs.mkdirSync(path.join(dir, 'review', 'design', '1'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'review', 'autopilot', 'runlogs'), { recursive: true });
    return dir;
  };
  return { tmp, repo, a: mk('a'), b: mk('b') };
}
const write = (dir, rel, text) => fs.writeFileSync(path.join(dir, 'review', rel), text);
const read = (dir, rel) => fs.readFileSync(path.join(dir, 'review', rel), 'utf8');

test('push した状態が別の作業ツリーへ pull で届く（runlogs と lock.txt は除く）', () => {
  const { repo, a, b } = setup();
  write(a, 'design/1/approved.md', '承認: 悠\n');
  write(a, 'autopilot/queue.md', 'queue\n');
  write(a, 'autopilot/runlogs/x.log', 'log\n');
  write(a, 'autopilot/lock.txt', 'local-only\n');
  write(a, 'handoff-steam-kids-2026-10-13.md', '引き継ぎ\n');
  assert.equal(push(a, repo), true);
  assert.equal(pull(b, repo) > 0, true);
  assert.equal(read(b, 'design/1/approved.md'), '承認: 悠\n');
  assert.equal(read(b, 'autopilot/queue.md'), 'queue\n');
  assert.equal(read(b, 'handoff-steam-kids-2026-10-13.md'), '引き継ぎ\n');
  assert.equal(fs.existsSync(path.join(b, 'review', 'autopilot', 'runlogs', 'x.log')), false);
  assert.equal(fs.existsSync(path.join(b, 'review', 'autopilot', LOCK_FILE)), false);
});

test('差分が無ければ push は何もしない。コミットの作成者は noreply で Co-Authored-By が無い', () => {
  const { repo, a } = setup();
  write(a, 'autopilot/queue.md', 'queue\n');
  assert.equal(push(a, repo), true);
  assert.equal(push(a, repo), false);
  const log = spawnSync('git', ['--git-dir', repo, 'log', '--format=%ae%n%B'], { encoding: 'utf8' }).stdout;
  assert.match(log, /@users\.noreply\.github\.com/);
  assert.doesNotMatch(log, /Co-Authored-By/i);
});

test('lock：他方が12時間以内なら競合、unlock 後と12時間後は取れる、同じ持ち主は取り直せる', () => {
  const { repo, a, b } = setup();
  const t0 = new Date('2026-10-13T00:00:00Z');
  lock(a, 'local', repo, t0);
  assert.throws(() => lock(b, 'cloud', repo, new Date('2026-10-13T05:00:00Z')), LockConflict);
  lock(a, 'local', repo, new Date('2026-10-13T06:00:00Z'));
  lock(b, 'cloud', repo, new Date('2026-10-14T00:00:00Z'));
  unlock(b, repo);
  lock(a, 'local', repo, new Date('2026-10-14T00:30:00Z'));
});

test('未同期検知：pull／push の後に queue.md を手で編集すると pull は UnsyncedEdit。初回（記録なし）は検知しない', () => {
  const { repo, a, b } = setup();
  write(a, 'autopilot/queue.md', 'q1\n');
  assert.equal(push(a, repo), true);
  assert.doesNotThrow(() => pull(b, repo)); // b は初回
  write(b, 'autopilot/queue.md', 'q1\n手元の追記\n');
  assert.throws(() => pull(b, repo), UnsyncedEdit);
  assert.equal(read(b, 'autopilot/queue.md'), 'q1\n手元の追記\n');
  push(b, repo); // push で記録が更新され、以後は検知しない
  assert.doesNotThrow(() => pull(b, repo));
  fs.mkdirSync(path.join(b, 'review', 'autopilot', 'decisions'), { recursive: true });
  write(b, 'autopilot/decisions/inbox.md', 'x\n');
  assert.throws(() => pull(b, repo), UnsyncedEdit);
});

test('受け口：state が空でも手元の2行は pull で消えない。state 側の行とは重複なしで結合', () => {
  const { repo, a, b } = setup();
  write(a, 'autopilot/queue-inbox.md', '');
  push(a, repo);
  write(b, 'autopilot/queue-inbox.md', '#1\n#2\n');
  pull(b, repo);
  assert.equal(read(b, 'autopilot/queue-inbox.md'), '#1\n#2\n');
  write(a, 'autopilot/queue-inbox.md', '#2\n#3\n');
  push(a, repo);
  pull(b, repo);
  assert.equal(read(b, 'autopilot/queue-inbox.md'), '#2\n#3\n#1\n');
});

test('start：受け口の行が queue.md 末尾へ追記され、受け口は空になる。lock 競合は従来どおり', () => {
  const { repo, a, b } = setup();
  write(a, 'autopilot/queue.md', 'q1');
  write(a, 'autopilot/queue-inbox.md', '#7\n\n#8\n');
  const r = start(a, 'local', repo);
  assert.equal(r.drained, 2);
  assert.equal(read(a, 'autopilot/queue.md'), 'q1\n#7\n#8\n');
  assert.equal(read(a, 'autopilot/queue-inbox.md'), '');
  assert.equal(drainInbox(a), 0);
  assert.throws(() => start(b, 'cloud', repo), LockConflict);
});
