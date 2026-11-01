import test from 'node:test';
import assert from 'node:assert/strict';
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
