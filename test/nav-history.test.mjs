// Issue #739: popstateAction・URL組み立ての純関数テスト。実行: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { popstateAction, mapSearchFor, lessonSearchFor } from '../js/nav-history.js';

const base = { search: '?lesson=a', renderedSearch: '?lesson=a', hasStepIndex: false, stateLoadId: undefined, loadId: 'L' };

test('nav-history: 表示中と別のURLに来たら reload', () => {
  assert.equal(popstateAction({ ...base, search: '?view=map&from=a' }), 'reload');
});
test('nav-history: リロード前に積んだステップの履歴は map', () => {
  assert.equal(popstateAction({ ...base, hasStepIndex: true, stateLoadId: 'OLD' }), 'map');
});
test('nav-history: 同じ読み込みのステップの履歴は ignore', () => {
  assert.equal(popstateAction({ ...base, hasStepIndex: true, stateLoadId: 'L' }), 'ignore');
});
test('nav-history: stepIndex の無い同URLの履歴は ignore', () => {
  assert.equal(popstateAction(base), 'ignore');
});
test('nav-history: URL組み立て', () => {
  assert.equal(mapSearchFor('cmd-01-susumu'), '?view=map&from=cmd-01-susumu');
  assert.equal(lessonSearchFor('a b'), '?lesson=a%20b');
});
