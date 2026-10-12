// 盤面エディタ用の開発サーバー（開発者用・手元専用）。実行: npm run editor
// - 127.0.0.1 のみに bind（0.0.0.0 等は起動時に拒否）。既定 port 5173、環境変数 EDITOR_PORT で上書き（整数 1〜65535）
// - 配信は tools/editor/ 配下と js/ 配下の .js のみ。`..` を含むパスは 404
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';

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
  // 盤面部品（renderGrid 等）が使うクラスの定義。ルートの style.css（生成物）だけを読み取り専用で返す
  if (p === '/style.css') return path.join(ROOT, 'style.css');
  if (p.startsWith('/js/')) {
    if (!p.endsWith('.js')) return null;
    const file = path.resolve(JS_DIR, p.slice('/js/'.length));
    return file.startsWith(JS_DIR + path.sep) ? file : null;
  }
  const file = path.resolve(EDITOR_DIR, '.' + p);
  return file.startsWith(EDITOR_DIR + path.sep) ? file : null;
}

export const ANALYZE_TIMEOUT_MS = 10_000; // 判定の打ち切り（仮置き。#389 子A の実測後に見直す）
const WORKER_FILE = path.join(EDITOR_DIR, 'validate-worker.mjs');
const BODY_MAX_BYTES = 1_000_000;
const ID_RE = /^[a-z0-9-]+$/;
const MAX_GRID = 20; // checkBoard の上限と同じ

const isPoint = (p) => !!p && Number.isInteger(p.x) && Number.isInteger(p.y);

// 判定 API の入力検査。問題があれば messages（空なら OK）。
export function checkAnalyzeInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return ['body は {spec, lessonId?, index?} の JSON オブジェクトにしてください'];
  const { spec, lessonId, index } = body;
  const out = [];
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) return ['spec（盤面 JSON）がありません'];
  const g = spec.grid;
  if (!g || typeof g !== 'object') out.push('spec.grid がありません');
  else if (!Number.isInteger(g.cols) || !Number.isInteger(g.rows) || g.cols < 1 || g.rows < 1 || g.cols > MAX_GRID || g.rows > MAX_GRID) {
    out.push(`spec.grid は 1〜${MAX_GRID} の整数の cols×rows にしてください`);
  }
  if (!isPoint(spec.start)) out.push('spec.start（{x,y}）がありません');
  if (!isPoint(spec.goal)) out.push('spec.goal（{x,y}）がありません');
  if (lessonId !== undefined && (typeof lessonId !== 'string' || !ID_RE.test(lessonId))) out.push('lessonId は ^[a-z0-9-]+$ にしてください');
  if (index !== undefined && !(Number.isInteger(index) && index >= 0)) out.push('index は 0 以上の整数にしてください');
  return out;
}

// spec を worker_threads で判定する。timeoutMs を超えたら打ち切り、status:'timeout'（他の値は null）。
export function runAnalyze(spec, { timeoutMs = ANALYZE_TIMEOUT_MS, workerFile = WORKER_FILE } = {}) {
  return new Promise((resolve) => {
    const worker = new Worker(workerFile, { workerData: { spec } });
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      worker.terminate();
      resolve(value);
    };
    const timer = setTimeout(() => finish({ status: 'timeout', clearable: null, shortest: null, matters: null, turns: null, gradient: [], messages: [] }), timeoutMs);
    worker.once('message', (m) => {
      if (m && m.ok) finish({ status: 'ok', gradient: [], ...m.result });
      else finish({ status: 'ok', clearable: false, shortest: null, matters: null, turns: null, gradient: [], messages: [`判定中にエラー: ${m && m.error}`] });
    });
    worker.once('error', (e) => finish({ status: 'ok', clearable: false, shortest: null, matters: null, turns: null, gradient: [], messages: [`判定中にエラー: ${e.message}`] }));
  });
}

function sendJson(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > BODY_MAX_BYTES) { resolve(null); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', () => resolve(null));
  });
}

// POST /api/analyze。400（壊れた入力・上限超過）／404（lessonId なし）／200。
async function handleAnalyze(req, res, opts) {
  const raw = await readBody(req);
  if (raw === null) return sendJson(res, 400, { messages: ['body が大きすぎます'] });
  let body;
  try { body = JSON.parse(raw); } catch { return sendJson(res, 400, { messages: ['JSON として読めません'] }); }
  const problems = checkAnalyzeInput(body);
  if (problems.length > 0) return sendJson(res, 400, { messages: problems });
  const { lessonId, index } = body;
  if (lessonId !== undefined) {
    let steps;
    try {
      const lessonsDir = process.env.LESSONS_DIR || path.join(ROOT, 'lessons');
      steps = JSON.parse(await fs.promises.readFile(path.join(lessonsDir, `${lessonId}.json`), 'utf8')).steps;
    } catch { return sendJson(res, 404, { messages: [`lessonId=${lessonId} のレッスンがありません`] }); }
    if (index !== undefined && !(Array.isArray(steps) && index < steps.length)) return sendJson(res, 400, { messages: ['index が範囲外です'] });
  }
  sendJson(res, 200, await runAnalyze(body.spec, opts));
}

export function createEditorServer(opts = {}) {
  return http.createServer((req, res) => {
    const notFound = () => { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Not Found'); };
    if (req.method === 'POST' && new URL(req.url, 'http://localhost').pathname === '/api/analyze') {
      handleAnalyze(req, res, opts).catch(() => sendJson(res, 500, { messages: ['内部エラー'] }));
      return;
    }
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
export function startEditorServer({ host = EDITOR_HOST, port = DEFAULT_PORT, ...opts } = {}) {
  if (host !== EDITOR_HOST) throw new Error(`エディタは ${EDITOR_HOST} のみに bind できます（指定: ${host}）`);
  const server = createEditorServer(opts);
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
