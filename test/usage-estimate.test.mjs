// usage-estimate.mjs のテスト（Issue #640）。記録ファイルは一時ファイルで作る。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'tools', 'usage-estimate.mjs');
const NOW = '2026-11-01T12:00:00+09:00';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'usage-estimate-'));
let seq = 0;

function row(at, o = {}) {
  return JSON.stringify({ at, five: 0, week: 40, fiveSource: '引数', weekSource: '引数', ...o });
}
function run(lines, extra = []) {
  const file = path.join(TMP, `u${seq++}.jsonl`);
  if (lines !== null) fs.writeFileSync(file, lines.join('\n') + '\n');
  return spawnSync(process.execPath, [SCRIPT, '--now', NOW, '--file', file, ...extra], { encoding: 'utf8' });
}
function out(lines) {
  const r = run(lines);
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
}

test('5時間以内：five + estAdded', () => {
  assert.equal(out([row('2026-11-01T09:00:00+09:00', { five: 20, estAdded: 10 })]), '週間 40 5時間 30 出典 推定（省略）');
});
test('5時間ちょうどは 0', () => {
  assert.match(out([row('2026-11-01T07:00:00+09:00', { five: 20 })]), /5時間 0 /);
});
test('5時間未満の境目（4時間59分）は有効', () => {
  assert.match(out([row('2026-11-01T07:01:00+09:00', { five: 20 })]), /5時間 20 /);
});
test('5時間超は 0', () => {
  assert.match(out([row('2026-11-01T06:00:00+09:00', { five: 20 })]), /5時間 0 /);
});
test('記録なし（ファイル無し・空）は 5時間 0・週間 不明で終了コード0', () => {
  assert.equal(out(null), '週間 不明 5時間 0 出典 推定（省略）');
  assert.equal(out(['']), '週間 不明 5時間 0 出典 推定（省略）');
});
test('週間が7日以上前（ちょうど7日も）は不明', () => {
  assert.match(out([row('2026-10-25T12:00:00+09:00', { week: 50 })]), /^週間 不明 /);
  assert.match(out([row('2026-10-25T12:00:01+09:00', { week: 50 })]), /^週間 50 /);
  assert.match(out([row('2026-10-20T12:00:00+09:00', { week: 50 })]), /^週間 不明 /);
});
test('週間は最後の引数の値（推定の行は使わない）', () => {
  const s = out([
    row('2026-10-30T12:00:00+09:00', { week: 30 }),
    row('2026-10-31T12:00:00+09:00', { week: 45 }),
    row('2026-11-01T01:00:00+09:00', { week: 99, weekSource: '推定' }),
  ]);
  assert.match(s, /^週間 45 /);
});
test('見積もりの加算は起点の行の estAdded（他の行の分は足さない）', () => {
  const s = out([
    row('2026-11-01T08:00:00+09:00', { five: 10, estAdded: 5 }),
    row('2026-11-01T10:00:00+09:00', { five: 20, estAdded: 7 }),
  ]);
  assert.match(s, /5時間 27 /);
});
test('壊れた行・必須欄欠け・範囲外は読み飛ばす', () => {
  const s = out([
    row('2026-11-01T09:00:00+09:00', { five: 20, week: 33 }),
    '{ not json',
    JSON.stringify({ at: '2026-11-01T10:00:00+09:00', five: 60 }),
    row('2026-11-01T10:00:00+09:00', { five: 150 }),
    row('2026-11-01T10:00:00+09:00', { week: -1 }),
    row('2026-11-01T10:00:00+09:00', { five: 1.5 }),
    '[]',
    'null',
  ]);
  assert.equal(s, '週間 33 5時間 20 出典 推定（省略）');
});
test('週間だけ引数で5時間は推定（省略）の行：週間は引数として数える', () => {
  const s = out([row('2026-11-01T10:00:00+09:00', { five: 12, week: 61, fiveSource: '推定（省略）' })]);
  assert.equal(s, '週間 61 5時間 12 出典 推定（省略）');
});
test('5時間だけ引数で週間は推定（省略）の行：その週間は引数として数えない', () => {
  const s = out([
    row('2026-10-30T12:00:00+09:00', { week: 40 }),
    row('2026-11-01T10:00:00+09:00', { five: 12, week: 70, weekSource: '推定（省略）' }),
  ]);
  assert.equal(s, '週間 40 5時間 12 出典 推定（省略）');
});
test('最後の行の five が null：その行は起点にせず前の数の行を探す', () => {
  const s = out([
    row('2026-11-01T09:00:00+09:00', { five: 20, estAdded: 3 }),
    row('2026-11-01T11:00:00+09:00', { five: null, fiveSource: null }),
  ]);
  assert.match(s, /5時間 23 /);
  assert.match(out([row('2026-11-01T11:00:00+09:00', { five: null, fiveSource: null })]), /5時間 0 /);
});
test('estAdded 欠けは 0', () => {
  assert.match(out([row('2026-11-01T11:00:00+09:00', { five: 8 })]), /5時間 8 /);
});
test('at が読めない行・未来の at の行は読み飛ばす', () => {
  const s = out([
    row('2026-11-01T09:00:00+09:00', { five: 20, week: 33 }),
    row('いつか', { five: 90, week: 90 }),
    row('2026-11-01T13:00:00+09:00', { five: 80, week: 80 }),
  ]);
  assert.equal(s, '週間 33 5時間 20 出典 推定（省略）');
});
test('引数の誤りは終了コード2', () => {
  for (const args of [['--now', 'bad'], ['--now'], ['--file'], ['--unknown'], ['x']]) {
    const r = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });
    assert.equal(r.status, 2, args.join(' '));
  }
});
test('ファイルを読めない（ディレクトリ）は終了コード1', () => {
  const r = spawnSync(process.execPath, [SCRIPT, '--now', NOW, '--file', TMP], { encoding: 'utf8' });
  assert.equal(r.status, 1);
});
