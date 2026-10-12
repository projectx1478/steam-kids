// 盤面エディタ用の開発サーバー（開発者用・手元専用）。実行: npm run editor
// - 127.0.0.1 のみに bind（0.0.0.0 等は起動時に拒否）。既定 port 5173、環境変数 EDITOR_PORT で上書き（整数 1〜65535）
// - 配信は tools/editor/ 配下と js/ 配下の .js のみ。`..` を含むパスは 404
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const EDITOR_HOST = '127.0.0.1';
export const DEFAULT_PORT = 5173;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const EDITOR_DIR = path.join(ROOT, 'tools', 'editor');
const JS_DIR = path.join(ROOT, 'js');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
};

export function parsePort(value) {
  if (value === undefined || value === '') return DEFAULT_PORT;
  const s = String(value);
  if (!/^\d+$/.test(s)) throw new Error(`EDITOR_PORT は整数 1〜65535 で指定してください: ${s}`);
  const n = Number(s);
  if (n < 1 || n > 65535) throw new Error(`EDITOR_PORT は整数 1〜65535 で指定してください: ${s}`);
  return n;
}

// URL のパスを配信するファイルの絶対パスにする。配信対象外なら null（404）。
export function resolveRequest(urlPath) {
  let p;
  try { p = decodeURIComponent(urlPath); } catch { return null; }
  if (p.includes('..') || p.includes('\\') || p.includes('\0')) return null;
  if (p === '/') p = '/index.html';
  if (p.startsWith('/js/')) {
    if (!p.endsWith('.js')) return null;
    const file = path.resolve(JS_DIR, p.slice('/js/'.length));
    return file.startsWith(JS_DIR + path.sep) ? file : null;
  }
  const file = path.resolve(EDITOR_DIR, '.' + p);
  return file.startsWith(EDITOR_DIR + path.sep) ? file : null;
}

export function createEditorServer() {
  return http.createServer((req, res) => {
    const notFound = () => { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Not Found'); };
    if (req.method !== 'GET' && req.method !== 'HEAD') return notFound();
    const file = resolveRequest(new URL(req.url, 'http://localhost').pathname);
    if (!file) return notFound();
    fs.readFile(file, (err, data) => {
      if (err) return notFound();
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(req.method === 'HEAD' ? undefined : data);
    });
  });
}

// host が 127.0.0.1 以外なら拒否する。port 0 は試験用（空きポート）。
export function startEditorServer({ host = EDITOR_HOST, port = DEFAULT_PORT } = {}) {
  if (host !== EDITOR_HOST) throw new Error(`エディタは ${EDITOR_HOST} のみに bind できます（指定: ${host}）`);
  const server = createEditorServer();
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, EDITOR_HOST, () => resolve(server));
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const port = parsePort(process.env.EDITOR_PORT);
    const server = await startEditorServer({ port });
    console.log(`盤面エディタ（開発者用）: http://${EDITOR_HOST}:${server.address().port}/`);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
