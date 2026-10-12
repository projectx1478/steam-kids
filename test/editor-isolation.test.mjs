// #397: 盤面エディタが子ども向け画面から隔離されていること、サーバーが手元専用であること。実行: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import { startEditorServer, parsePort, resolveRequest } from '../tools/editor/serve.mjs';

for (const f of ['service-worker.js', 'index.html', 'app.js']) {
  test(`editor-isolation: ${f} に tools/editor が出ない`, () => {
    assert.equal(fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').includes('tools/editor'), false);
  });
}

function get(port, urlPath) {
  return new Promise((resolve, reject) => {
    // path をそのまま送る（URL 正規化で `..` が消えないように http.request を使う）
    http.get({ host: '127.0.0.1', port, path: urlPath }, (res) => {
      res.resume();
      res.on('end', () => resolve(res.statusCode));
    }).on('error', reject);
  });
}

test('editor-isolation: 127.0.0.1 に bind し、トップが開き、`..` は 404', async () => {
  const server = await startEditorServer({ port: 0 });
  try {
    const addr = server.address();
    assert.equal(addr.address, '127.0.0.1');
    assert.equal(await get(addr.port, '/'), 200);
    assert.equal(await get(addr.port, '/js/ui-board.js'), 200);
    assert.equal(await get(addr.port, '/../package.json'), 404);
    assert.equal(await get(addr.port, '/js/../package.json'), 404);
    assert.equal(await get(addr.port, '/%2e%2e/package.json'), 404);
    assert.equal(await get(addr.port, '/..%5Cpackage.json'), 404);
    assert.equal(await get(addr.port, '/index.html/../../../package.json'), 404);
    assert.equal(await get(addr.port, '/js/gimmicks/../../package.json'), 404);
    assert.equal(await get(addr.port, '/package.json'), 404);
    assert.equal(await get(addr.port, '/js/../lessons/x.json'), 404);
  } finally {
    await new Promise((r) => server.close(r));
  }
});

test('editor-isolation: 127.0.0.1 以外の bind は起動時に拒否', () => {
  for (const host of ['0.0.0.0', '::', '::1', 'localhost', '192.168.0.1', '']) {
    assert.throws(() => startEditorServer({ host }), /127\.0\.0\.1/, `host=${host}`);
  }
});

test('editor-isolation: EDITOR_PORT は整数 1〜65535 のみ', () => {
  assert.equal(parsePort(undefined), 5173);
  assert.equal(parsePort('1'), 1);
  assert.equal(parsePort('65535'), 65535);
  for (const bad of ['0', '65536', '-1', '1.5', 'abc', '80a', ' 80']) {
    assert.throws(() => parsePort(bad), /EDITOR_PORT/, bad);
  }
});

test('editor-isolation: 配信対象外は resolveRequest が null', () => {
  assert.equal(resolveRequest('/..'), null);
  assert.equal(resolveRequest('/js/app.json'), null);
  assert.notEqual(resolveRequest('/js/ui-grid.js'), null);
});
