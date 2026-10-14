// #397: 盤面エディタが子ども向け画面から隔離されていること、サーバーが手元専用であること。実行: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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
    assert.equal(await get(addr.port, '/style.css'), 200);
    assert.equal(await get(addr.port, '/style.css/x'), 404);
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

// #403: ためしあそび用の子ども画面の読み取り専用配信（許可リスト）
test('editor-isolation: 子ども画面のファイルは resolveRequest が返す', () => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  assert.equal(resolveRequest('/play.html'), path.join(root, 'index.html'));
  assert.equal(resolveRequest('/app.js'), path.join(root, 'app.js'));
  assert.equal(resolveRequest('/lessons/cmd-02-mijikaku.json'), path.join(root, 'lessons', 'cmd-02-mijikaku.json'));
  assert.equal(resolveRequest('/lessons/index.json'), path.join(root, 'lessons', 'index.json'));
  assert.equal(resolveRequest('/fonts/mplusrounded1c-800.woff2'), path.join(root, 'fonts', 'mplusrounded1c-800.woff2'));
});

test('editor-isolation: 許可リスト外・`..` 走査は子ども画面側に出ない、エディタの入口は不変', () => {
  const editorDir = path.resolve(fileURLToPath(new URL('../tools/editor/', import.meta.url)));
  for (const p of ['/lessons/', '/lessons/x.txt', '/lessons/a/b.json', '/lessons/../package.json', '/lessons/%2e%2e/package.json', '/fonts/OFL.txt', '/fonts/../package.json', '/service-worker.js', '/dashboard.html', '/play.html/x', '/app.js/x', '/README.md']) {
    // 許可リスト外は null か、tools/editor/ 配下（そこに無ければ 404）。子ども画面のファイルには決してならない
    const r = resolveRequest(p);
    assert.ok(r === null || r.startsWith(editorDir + path.sep), `${p} -> ${r}`);
  }
  const editorIndex = path.join(editorDir, 'index.html');
  assert.equal(resolveRequest('/'), editorIndex);
  assert.equal(resolveRequest('/index.html'), editorIndex);
});

test('editor-isolation: 子ども画面の配信は読み取り専用（POST は 404）で、実ファイルが返る', async () => {
  const server = await startEditorServer({ port: 0 });
  try {
    const { port } = server.address();
    assert.equal(await get(port, '/play.html'), 200);
    assert.equal(await get(port, '/app.js'), 200);
    assert.equal(await get(port, '/lessons/index.json'), 200);
    assert.equal(await get(port, '/fonts/mplusrounded1c-800.woff2'), 200);
    assert.equal(await get(port, '/service-worker.js'), 404);
    const post = await new Promise((resolve, reject) => {
      const r = http.request({ host: '127.0.0.1', port, path: '/lessons/index.json', method: 'POST' }, (res) => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
      r.on('error', reject);
      r.end('{}');
    });
    assert.equal(post, 404);
  } finally {
    await new Promise((r) => server.close(r));
  }
});
