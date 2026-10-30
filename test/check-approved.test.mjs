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
