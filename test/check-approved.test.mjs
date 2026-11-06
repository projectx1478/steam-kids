import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkApproved } from '../tools/check-approved.mjs';

const FULL = [
  '承認: 悠 2026-10-27',
  '見積もり: 10',
  '## 決定', '- x',
  '## 段の分け方', '- x',
  '## 実装時に守ること',
  '- 範囲：a', '- 停止条件：b', '- 報告：c', '- PR規則：d', '- 事前許可：なし',
  '## E2E への影響', '## 検証コスト', '## 検証計画', '## 使う共通部品',
  '## 部品化の置き換え計画', '## 入力仕様', '## 状態遷移表（UI）', '## 文言の経路一覧',
  '## 事前点検', '## 止まりうる点と対処',
].join('\n');

test('必須項目がそろえば欠けなし（見出しの後ろに文が付いてもよい）', () => {
  assert.deepEqual(checkApproved(FULL), []);
});

test('見出しを消すと欠けとして列挙する', () => {
  const m = checkApproved(FULL.replace('## 検証計画\n', ''));
  assert.deepEqual(m, ['## 検証計画']);
});

test('承認: 行が無いと欠け、--draft なら外す', () => {
  const t = FULL.replace(/^承認:.*\n/, '');
  assert.deepEqual(checkApproved(t), ['承認: 行']);
  assert.deepEqual(checkApproved(t, { draft: true }), []);
});

test('実装時に守ること の5項が欠けると列挙する', () => {
  const m = checkApproved(FULL.replace('- 事前許可：なし\n', '').replace('- 事前許可：なし', ''));
  assert.deepEqual(m, ['実装時に守ること／事前許可']);
});

test('新しい見出し2つが無いと欠けになる', () => {
  const t = FULL.replace('## 事前点検\n', '').replace('\n## 止まりうる点と対処', '');
  assert.deepEqual(checkApproved(t), ['## 事前点検', '## 止まりうる点と対処']);
});

test('未決を含む行は欠け。バッククォート内・HTMLコメント内・draft では欠けにならない', () => {
  const bad = FULL.replace('見積もり: 10', '見積もり: 10\n未決: 色をどうするか');
  assert.deepEqual(checkApproved(bad), ['未決の残り（3行目）: 未決: 色をどうするか']);
  assert.deepEqual(checkApproved(bad, { draft: true }), []);
  assert.deepEqual(checkApproved(FULL.replace('見積もり: 10', '見積もり: 10\n`未決` と書く')), []);
  assert.deepEqual(checkApproved(FULL.replace('見積もり: 10', '見積もり: 10\n<!-- 要確認\n未決 -->')), []);
});

test('<日付> は欠け、<details> は欠けにならない', () => {
  assert.deepEqual(checkApproved(FULL.replace('悠 2026-10-27', '悠 <日付>')), ['未決の残り（1行目）: 承認: 悠 <日付>']);
  assert.deepEqual(checkApproved(FULL.replace('見積もり: 10', '見積もり: 10\n<details>')), []);
});

const SUP_MISSING = '上位規則の行（本文に「上位規則…。テンプレート同期の対象外…」）';
const touching = (line) => FULL.replace('## 段の分け方\n- x', `## 段の分け方\n${line}`);
const TOUCH_DOCS = touching('- 触る：docs/ui-rules.md の節');
const withDecision = (base, line) => base.replace('## 決定\n- x', `## 決定\n${line}`);
const OPTS = [{ draft: true }, { strict: true }];

test('検査1 不合格：docs を触るのに上位規則の行が無い（旗なしでは走らない）', () => {
  for (const o of OPTS) assert.deepEqual(checkApproved(TOUCH_DOCS, o), [SUP_MISSING]);
  assert.deepEqual(checkApproved(TOUCH_DOCS), []);
});

test('検査1 合格：実物の6形', () => {
  const lines = [
    '- 上位規則：AGENTS.md・design-issue.md との衝突なし。docs/ui-rules.md はテンプレート同期の対象外',
    '- 上位規則との衝突：なし。テンプレート同期：対象外（確認済み）',
    '  - 上位規則との衝突：なし。テンプレート同期は対象外',
    '- 上位規則（AGENTS.md）に衝突なし。テンプレート同期対象外',
    '- 上位規則：なし。同期: 対象外',
  ];
  for (const l of lines) {
    for (const o of OPTS) assert.deepEqual(checkApproved(withDecision(TOUCH_DOCS, l), o), [], l);
  }
  const sec = TOUCH_DOCS.replace('## 事前点検', '## 事前点検\n- 上位規則：なし。テンプレート同期の対象外');
  assert.deepEqual(checkApproved(sec, { strict: true }), []);
});

test('検査1 不合格：同期の語が無い／別の行／配布対象の言い方', () => {
  for (const l of [
    '- 上位規則：衝突なし',
    '- 上位規則：衝突なし\n- テンプレート同期の対象外',
    '- 上位規則：なし。テンプレート同期の配布対象に含まれない',
  ]) assert.deepEqual(checkApproved(withDecision(TOUCH_DOCS, l), { strict: true }), [SUP_MISSING], l);
});

test('検査1 偽陽性なし', () => {
  const o = { strict: true };
  assert.deepEqual(checkApproved(FULL.replace('- 範囲：a', '- 範囲：触るのは tools/x.mjs。触らない：.claude/・docs/'), o), []);
  assert.deepEqual(checkApproved(touching('- 触る：.claude/verify/scenarios/a.mjs'), o), []);
  assert.deepEqual(checkApproved(touching('- 触る：.claude/commands/a.md'), o), [SUP_MISSING]);
  assert.deepEqual(checkApproved(touching('- 触る：AGENTS.md'), o), [SUP_MISSING]);
  assert.deepEqual(checkApproved(touching('- 触る：CLAUDE.md'), o), []);
  assert.deepEqual(checkApproved(touching('- 触る：PROJECT.md'), o), []);
  assert.deepEqual(checkApproved(FULL.replace('- 範囲：a', '- 範囲：docs/a.md。触らない：x'), o), [SUP_MISSING]);
});

test('検査2 不合格：E2E への影響の未確定語', () => {
  for (const w of ['足してよい', '必要なら', '検討']) {
    const t = FULL.replace('## E2E への影響', `## E2E への影響\n- ${w}`);
    for (const o of OPTS) assert.deepEqual(checkApproved(t, o), [`E2E への影響に未確定の語「${w}」（14行目）`]);
    assert.deepEqual(checkApproved(t), []);
  }
});

test('検査2 合格：語なし・コード片内・別の節', () => {
  const o = { strict: true };
  assert.deepEqual(checkApproved(FULL.replace('## E2E への影響', '## E2E への影響\n- 足す手順：なし'), o), []);
  assert.deepEqual(checkApproved(FULL.replace('## E2E への影響', '## E2E への影響\n- `検討` と書かない'), o), []);
  assert.deepEqual(checkApproved(FULL.replace('## 検証計画', '## 検証計画\n- 検討'), o), []);
});

test('引数の解析：--worktree の異常は終了コード2、順序に依存しない', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const cli = path.join(root, 'tools', 'check-approved.mjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'check-approved-'));
  const file = path.join(dir, 'approved.md');
  fs.writeFileSync(file, FULL);
  const run = (...a) => spawnSync(process.execPath, [cli, ...a], { encoding: 'utf-8', cwd: root });
  assert.equal(run(file, '--worktree').status, 2);
  assert.equal(run(file, '--worktree', '--draft').status, 2);
  assert.equal(run(file, '--worktree', path.join(dir, 'none')).status, 2);
  assert.equal(run(file, '--worktree', file).status, 2);
  for (const a of [[file, '--worktree', dir, '--strict'], ['--worktree', dir, file]]) {
    const r = run(...a);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /OK:/);
  }
  const r = run(file, '--strict');
  assert.equal(r.status, 0);
  assert.match(r.stderr, /--worktree が無いので/);
  fs.rmSync(dir, { recursive: true, force: true });
});
