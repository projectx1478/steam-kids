import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { listTests } from '../tools/test-unit-core.mjs';

const all = readdirSync(new URL('./', import.meta.url)).filter((f) => f.endsWith('.test.mjs')).sort();

test('core と generate の和集合が test/ 配下の全 *.test.mjs に一致し、重複しない', () => {
  const core = listTests({ generate: false });
  const generate = listTests({ generate: true });
  assert.deepEqual([...core, ...generate].sort(), all);
  assert.equal(new Set([...core, ...generate]).size, core.length + generate.length);
});

test('generate は engine-generate.test.mjs を含み、core は含まない', () => {
  assert.ok(listTests({ generate: true }).includes('engine-generate.test.mjs'));
  assert.ok(!listTests({ generate: false }).includes('engine-generate.test.mjs'));
  assert.ok(listTests({ generate: false }).includes('test-unit-core.test.mjs'));
});
