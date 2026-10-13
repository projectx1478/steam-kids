// 盤面エディタ用の開発サーバー（開発者用・手元専用）。実行: npm run editor
// - 127.0.0.1 のみに bind（0.0.0.0 等は起動時に拒否）。既定 port 5173、環境変数 EDITOR_PORT で上書き（整数 1〜65535）
// - 配信は tools/editor/ 配下と js/ 配下の .js のみ。`..` を含むパスは 404
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Worker } from 'node:worker_threads';
import { formatLesson } from '../gen-stages.mjs';
import { shortestSteps, shortestChips, boardSpec } from '../../js/engine-grid.js';

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

// 勾配（難易度の順序）。validate-lessons.mjs の「難易度の順序」検査と同じ規則・文言：最短手数が前の面より短ければ警告（同じ最短は許す）。
// 編集中の面（steps の index 番目を spec で置き換えたもの）を、前後の play と比べる。下書きは比べない。
// repeatBox の面は箱なしの最短のみ。groupRepeats の面と通常の面は混ぜない（種類が違う隣は比べない）。
// 戻り値 { gradient:[{lessonId,index,shortest,ok}], messages }。gradient は前・編集中・後の順で、ok は直前の面より短くないこと。
export function computeGradient({ lessonId, index, steps, spec, shortest }) {
  const none = { gradient: [], messages: [] };
  if (!Array.isArray(steps) || !Number.isInteger(index) || index < 0 || index >= steps.length) return none;
  if (typeof shortest !== 'number' || shortest === Infinity) return none;
  const grouped = !!spec.groupRepeats;
  const distOf = (play) => {
    if (!play || !play.start || !play.goal || !play.grid || !play.grid.cols || !play.grid.rows) return null;
    if (!!play.groupRepeats !== grouped) return null;
    const board = boardSpec({ ...play, allowedCommands: play.allowedCommands ?? ['up', 'down', 'left', 'right'] });
    const d = grouped ? shortestChips(board) : shortestSteps(board);
    return d === Infinity ? null : d;
  };
  const neighbor = (from, dir) => {
    for (let i = from + dir; i >= 0 && i < steps.length; i += dir) {
      if (steps[i] && steps[i].kind === 'play') return i;
    }
    return -1;
  };
  const labelOf = (i, step) => (step && step.stepId) || `index=${i}`;
  const entries = [];
  const prevI = neighbor(index, -1);
  const nextI = neighbor(index, 1);
  if (prevI >= 0) { const d = distOf(steps[prevI]); if (d !== null) entries.push({ i: prevI, shortest: d, label: labelOf(prevI, steps[prevI]) }); }
  entries.push({ i: index, shortest, label: (spec && spec.stepId) || labelOf(index, steps[index]) });
  if (nextI >= 0) { const d = distOf(steps[nextI]); if (d !== null) entries.push({ i: nextI, shortest: d, label: labelOf(nextI, steps[nextI]) }); }
  const messages = [];
  const gradient = entries.map((e, k) => {
    const prev = k > 0 ? entries[k - 1] : null;
    const ok = !prev || !(e.shortest < prev.shortest);
    if (!ok) {
      messages.push(`難易度の順序: stepId="${e.label}" の最短(${e.shortest})がstepId="${prev.label}"の最短(${prev.shortest})より短い（ステージが進むほど難易度は非減少である必要がある）`);
    }
    return { lessonId, index: e.i, shortest: e.shortest, ok };
  });
  return { gradient, messages };
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
  let steps = null;
  if (lessonId !== undefined) {
    try {
      const lessonsDir = process.env.LESSONS_DIR || path.join(ROOT, 'lessons');
      steps = JSON.parse(await fs.promises.readFile(path.join(lessonsDir, `${lessonId}.json`), 'utf8')).steps;
    } catch { return sendJson(res, 404, { messages: [`lessonId=${lessonId} のレッスンがありません`] }); }
    if (index !== undefined && !(Array.isArray(steps) && index < steps.length)) return sendJson(res, 400, { messages: ['index が範囲外です'] });
  }
  const result = await runAnalyze(body.spec, opts);
  if (result.status === 'ok' && steps && index !== undefined) {
    const g = computeGradient({ lessonId, index, steps, spec: body.spec, shortest: result.shortest });
    result.gradient = g.gradient;
    result.messages = [...(result.messages || []), ...g.messages];
  }
  sendJson(res, 200, result);
}

// ---- レッスンの読み書き（#402 段1）。書き込み先は lessons/<id>.json と退避置き場だけ。index.json・新規作成は不可 ----
export const SAVE_TIMEOUT_MS = 10_000; // 保存検査の打ち切り（ANALYZE_TIMEOUT_MS と同じ仮置き）
export const BACKUP_KEEP = 10; // レッスンごとの退避の保持数
const SAVE_WORKER_CODE = `
const { parentPort, workerData } = require('node:worker_threads');
(async () => {
  try {
    const { validateLesson, validateIndex } = await import(workerData.validateUrl);
    const { id, data, longTrialIds, indexData, lessons, fileIds } = workerData;
    const errors = validateLesson(id + '.json', data, longTrialIds);
    if (indexData) errors.push(...validateIndex(indexData, new Map(lessons), new Set(fileIds)));
    parentPort.postMessage({ ok: true, errors });
  } catch (e) {
    parentPort.postMessage({ ok: false, error: String(e && e.message ? e.message : e) });
  }
})();
`;
const VALIDATE_URL = pathToFileURL(path.join(ROOT, 'tools', 'validate-lessons.mjs')).href;

const lessonsDirOf = (opts) => opts.lessonsDir || process.env.LESSONS_DIR || path.join(ROOT, 'lessons');
const backupsDirOf = (opts) => opts.backupsDir || path.join(EDITOR_DIR, 'backups');

// :id の検査。問題があれば messages（空なら OK）。index は書き込み・読み出しの対象外。
export function checkLessonId(id) {
  if (typeof id !== 'string' || !ID_RE.test(id)) return ['id は ^[a-z0-9-]+$ にしてください'];
  if (id === 'index') return ['index は対象外です（index.json には書き込めません）'];
  return [];
}

// dir 直下の <id>.json の絶対パス。dir の外に出るなら null。
function lessonFileOf(dir, id) {
  const base = path.resolve(dir);
  const file = path.resolve(base, `${id}.json`);
  return path.dirname(file) === base ? file : null;
}

const pad2 = (n) => String(n).padStart(2, '0');
export function backupStamp(d = new Date()) {
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`;
}

// 書く前の退避。backups/<id>-<YYYYMMDD-HHmmss>.json にコピーし、レッスンごとに新しい方から BACKUP_KEEP 件だけ残す。
export async function backupLesson(id, raw, backupsDir, now = new Date()) {
  await fs.promises.mkdir(backupsDir, { recursive: true });
  const stamp = backupStamp(now);
  const re = new RegExp(`^${id}-(\\d{8}-\\d{6})(?:-(\\d+))?\\.json$`);
  // 古い順: 時刻部分（文字列＝時系列順）→ 同秒の連番（数値。素の名前は 1 扱い）
  const seqOf = (f) => Number(re.exec(f)[2] || 1);
  const stampOf = (f) => re.exec(f)[1];
  // 同秒の連番は、残っている最大の次から振る（古い名前が消えた後に空いた名前を再利用して順序が崩れるのを防ぐ）
  let n = Math.max(0, ...(await fs.promises.readdir(backupsDir)).filter((f) => re.test(f) && stampOf(f) === stamp).map(seqOf)) + 1;
  let name;
  for (;; n++) {
    name = n === 1 ? `${id}-${stamp}.json` : `${id}-${stamp}-${n}.json`;
    try { await fs.promises.writeFile(path.join(backupsDir, name), raw, { encoding: 'utf8', flag: 'wx' }); break; } catch (e) {
      if (e.code !== 'EEXIST') throw e;
    }
  }
  const mine = (await fs.promises.readdir(backupsDir)).filter((f) => re.test(f))
    .sort((a, b) => (stampOf(a) < stampOf(b) ? -1 : stampOf(a) > stampOf(b) ? 1 : seqOf(a) - seqOf(b)));
  for (const f of mine.slice(0, Math.max(0, mine.length - BACKUP_KEEP))) await fs.promises.unlink(path.join(backupsDir, f));
  return path.join(backupsDir, name);
}

async function readAllLessons(dir) {
  const files = (await fs.promises.readdir(dir)).filter((f) => f.endsWith('.json') && f !== 'index.json');
  const lessons = new Map();
  for (const f of files) {
    try { lessons.set(f.slice(0, -5), JSON.parse(await fs.promises.readFile(path.join(dir, f), 'utf8'))); } catch { /* 読めないファイルは飛ばす */ }
  }
  return { files, lessons };
}

// validateLesson・validateIndex をメモリ上で worker_threads から呼ぶ。timeoutMs で打ち切り（timeout:true）。
export function runSaveValidate(payload, timeoutMs = SAVE_TIMEOUT_MS) {
  return new Promise((resolve) => {
    const worker = new Worker(SAVE_WORKER_CODE, { eval: true, workerData: { ...payload, validateUrl: VALIDATE_URL } });
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      worker.terminate();
      resolve(value);
    };
    const timer = setTimeout(() => finish({ timeout: true, errors: [] }), timeoutMs);
    worker.once('message', (m) => finish(m && m.ok ? { timeout: false, errors: m.errors } : { timeout: false, errors: [`検査中にエラー: ${m && m.error}`] }));
    worker.once('error', (e) => finish({ timeout: false, errors: [`検査中にエラー: ${e.message}`] }));
  });
}

async function handleLessons(req, res, pathname, opts) {
  const dir = lessonsDirOf(opts);
  if (pathname === '/api/lessons') {
    if (req.method !== 'GET') return sendJson(res, 404, { messages: ['Not Found'] });
    const { lessons } = await readAllLessons(dir);
    return sendJson(res, 200, [...lessons].sort(([a], [b]) => (a < b ? -1 : 1)).map(([id, d]) => ({ lessonId: id, title: d.title, unitId: d.unitId, stepCount: Array.isArray(d.steps) ? d.steps.length : 0 })));
  }
  let id;
  try { id = decodeURIComponent(pathname.slice('/api/lessons/'.length)); } catch { return sendJson(res, 400, { messages: ['id が不正です'] }); }
  const idProblems = checkLessonId(id);
  if (idProblems.length > 0) return sendJson(res, 400, { messages: idProblems });
  const file = lessonFileOf(dir, id);
  if (!file) return sendJson(res, 400, { messages: ['パスが不正です'] });
  let raw;
  try { raw = await fs.promises.readFile(file, 'utf8'); } catch { return sendJson(res, 404, { messages: [`${id} のレッスンがありません`] }); }
  let current;
  try { current = JSON.parse(raw); } catch { return sendJson(res, 400, { messages: [`${id}.json: JSONとして読めません`] }); }
  if (req.method === 'GET') return sendJson(res, 200, { ok: true, lessonId: id, steps: current.steps });
  if (req.method !== 'PUT') return sendJson(res, 404, { messages: ['Not Found'] });

  const text = await readBody(req);
  if (text === null) return sendJson(res, 400, { messages: ['body が大きすぎます'] });
  let body;
  try { body = JSON.parse(text); } catch { return sendJson(res, 400, { messages: ['JSON として読めません'] }); }
  if (!Array.isArray(body) || body.length === 0) return sendJson(res, 400, { messages: ['body は steps 全体（空でない配列）の JSON にしてください'] });

  const next = { ...current, steps: body };
  const { files, lessons } = await readAllLessons(dir);
  lessons.set(id, next);
  let indexData = null;
  try { indexData = JSON.parse(await fs.promises.readFile(path.join(dir, 'index.json'), 'utf8')); } catch { return sendJson(res, 400, { messages: ['index.json: 読めません（検査できないため保存しません）'] }); }
  const longTrialIds = Array.isArray(indexData.longTrialIds) ? indexData.longTrialIds.filter((x) => typeof x === 'string') : [];
  const fileIds = new Set([...files.map((f) => f.slice(0, -5)), id]);
  const result = await runSaveValidate({ id, data: next, longTrialIds, indexData, lessons: [...lessons], fileIds: [...fileIds] }, opts.saveTimeoutMs);
  if (result.timeout) return sendJson(res, 400, { messages: ['検査が時間内に終わらなかったため保存しません（時間切れ）'] });
  if (result.errors.length > 0) return sendJson(res, 400, { messages: result.errors });

  await backupLesson(id, raw, backupsDirOf(opts));
  const out = `${formatLesson(next)}\n`;
  await fs.promises.writeFile(file, raw.includes('\r\n') ? out.replace(/\n/g, '\r\n') : out, 'utf8');
  sendJson(res, 200, { ok: true });
}

export function createEditorServer(opts = {}) {
  return http.createServer((req, res) => {
    const notFound = () => { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Not Found'); };
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname === '/api/lessons' || pathname.startsWith('/api/lessons/')) {
      handleLessons(req, res, pathname, opts).catch(() => sendJson(res, 500, { messages: ['内部エラー'] }));
      return;
    }
    if (req.method === 'POST' && pathname === '/api/analyze') {
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
