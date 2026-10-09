#!/usr/bin/env node
// 手書きでない play ステップの生成・書き込み（Issue #337 段3）。
//   node tools/gen-stages.mjs --lesson <id>            候補の振り分けを表示（書き込まない）
//   node tools/gen-stages.mjs --lesson <id> --write    lessons/<id>.json の play を書き換える
// 条件を満たせなければ失敗して書き込まない。js/ は変えない。実行時は使わない。
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { shortestPath, boardSpec } from '../js/engine-grid.js';
import { generateBoard, canonicalKey, metrics, GEN_VERSION } from './gen/stage-gen.mjs';
import { validateLesson } from './validate-lessons.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LESSONS_DIR = process.env.LESSONS_DIR || path.join(__dirname, '..', 'lessons');
export const MAX_SEEDS = 200;
const NODE_BUDGET = 200000;

// 盤が前の面より2段以上急に大きくならない（cols・rows のどちらかが +2 以上は不可）
const growsOk = (prev, cur) => cur.grid.cols - prev.grid.cols < 2 && cur.grid.rows - prev.grid.rows < 2;

// 手書きの play の指標（最短・曲がり角）。盤は生成盤と同じ形に揃えて返す。
function handwrittenFace(play) {
  const solution = shortestPath(boardSpec(play)) ?? [];
  return { board: { ...play, solution }, ...metrics({ solution }) };
}

// 候補（seedBase から MAX_SEEDS 個の seed）を作り、正規形で重複を除く。seen には手書きの盤の正規形を入れて渡す。
export function collectCandidates(stageGen, seen = new Set()) {
  const base = stageGen.seedBase ?? 1;
  const out = [];
  for (let seed = base; seed < base + MAX_SEEDS; seed += 1) {
    const board = generateBoard(stageGen, seed);
    if (!board) continue;
    const key = canonicalKey(board);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ seed, board, ...metrics(board) });
  }
  out.sort((a, b) => a.steps - b.steps || a.turns - b.turns || a.seed - b.seed);
  return out;
}

// 振り分け。prev は直前の手書きの面（無ければ null）。
// 戻り値 { ok, faces: [{seed, board, steps, turns, breath}], reason }。
export function pickStages(stageGen, prev, candidates) {
  const keepCount = (stageGen.keepHandwritten ?? []).length;
  const n = stageGen.stages - keepCount;
  const breathPos = Math.max(Math.floor(stageGen.stages / 2), keepCount + 1, 2);
  const jb = breathPos - keepCount - 1; // 生成面の中での一息面の位置（0始まり）
  const nb = n - (jb < n ? 1 : 0); // 一息面を除いた面数
  const M = candidates.length;
  if (M < n) return { ok: false, reason: `候補が足りない（${M} 個。必要 ${n} 面。seed ${MAX_SEEDS} 個以内）` };
  const chosen = [];
  const used = new Set();
  let nodes = 0;
  const dfs = (j, last, lastIdx, k) => {
    nodes += 1;
    if (nodes > NODE_BUDGET) return false;
    if (j === n) return true;
    if (j === jb) {
      if (!last) return false;
      const opts = candidates.map((c, i) => [c, i])
        .filter(([c, i]) => !used.has(i) && c.steps === last.steps && c.turns < last.turns && growsOk(last.board, c.board))
        .sort((a, b) => b[0].turns - a[0].turns || a[0].seed - b[0].seed);
      for (const [c, i] of opts) {
        used.add(i);
        chosen.push({ ...c, breath: true });
        if (dfs(j + 1, c, lastIdx, k)) return true;
        chosen.pop();
        used.delete(i);
      }
      return false;
    }
    const remainingAfter = nb - k - 1;
    const target = nb > 1 ? Math.round((k * (M - 1)) / (nb - 1)) : 0;
    const idxs = [];
    for (let i = lastIdx + 1; i <= M - 1 - remainingAfter; i += 1) idxs.push(i);
    idxs.sort((a, b) => Math.abs(a - target) - Math.abs(b - target) || a - b);
    for (const i of idxs) {
      const c = candidates[i];
      if (used.has(i)) continue;
      if (last && (c.steps < last.steps || !growsOk(last.board, c.board))) continue;
      used.add(i);
      chosen.push({ ...c, breath: false });
      if (dfs(j + 1, c, i, k + 1)) return true;
      chosen.pop();
      used.delete(i);
    }
    return false;
  };
  if (!dfs(0, prev, -1, 0)) {
    return { ok: false, reason: `条件（最短の非減少・一息面・盤の大きさ）を満たす ${n} 面の組が見つからない（候補 ${M} 個）` };
  }
  return { ok: true, faces: chosen };
}

// 盤 -> play ステップ（lessons/*.json に書く形）
export function boardToStep(board, stepId, gen) {
  const step = {
    stepId, kind: 'play', grid: board.grid, start: board.start, goal: board.goal, walls: board.walls,
  };
  if (board.items?.length) step.items = board.items;
  if (board.ice?.length) step.ice = board.ice;
  if (board.keys?.length) { step.keys = board.keys; step.doors = board.doors; }
  step.allowedCommands = board.allowedCommands;
  step.solution = board.solution;
  step.maxCommands = board.maxCommands;
  step.gen = gen;
  return step;
}

// 既存の lessons/*.json の書式（短いものは1行、複数要素の配列は1行ずつ）に合わせて書き出す
const isPrim = (v) => v === null || typeof v !== 'object';
function inline(v) {
  if (isPrim(v)) return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(inline).join(', ')}]`;
  const e = Object.entries(v);
  return e.length === 0 ? '{}' : `{ ${e.map(([k, x]) => `${JSON.stringify(k)}: ${inline(x)}`).join(', ')} }`;
}
function canInline(v) {
  if (isPrim(v)) return true;
  if (Array.isArray(v)) {
    return v.length === 0 || v.every(isPrim) || (v.length === 1 && isPrim(v[0]) === false && !Array.isArray(v[0]) && Object.values(v[0]).every(isPrim));
  }
  return Object.values(v).every(isPrim);
}
export function formatLesson(v, depth = 0) {
  if (canInline(v)) return inline(v);
  const pad = '  '.repeat(depth + 1);
  const end = '  '.repeat(depth);
  if (Array.isArray(v)) return `[\n${v.map((x) => pad + formatLesson(x, depth + 1)).join(',\n')}\n${end}]`;
  return `{\n${Object.entries(v).map(([k, x]) => `${pad}${JSON.stringify(k)}: ${formatLesson(x, depth + 1)}`).join(',\n')}\n${end}}`;
}

function drawBoard(b) {
  const at = (list, x, y) => (list ?? []).find((p) => p.x === x && p.y === y);
  const rows = [];
  for (let y = 0; y < b.grid.rows; y += 1) {
    let line = '';
    for (let x = 0; x < b.grid.cols; x += 1) {
      line += at([b.start], x, y) ? 'S' : at([b.goal], x, y) ? 'G' : at(b.walls, x, y) ? '#'
        : at(b.items, x, y) ? 'o' : at(b.ice, x, y) ? '~' : at(b.keys, x, y) ? 'k' : at(b.doors, x, y) ? 'D' : '.';
    }
    rows.push(line);
  }
  return rows.join('\n');
}

async function readLongTrialIds() {
  try {
    const index = JSON.parse(await readFile(path.join(LESSONS_DIR, 'index.json'), 'utf-8'));
    return Array.isArray(index.longTrialIds) ? index.longTrialIds.filter((id) => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

// 計画を作る。失敗したら Error を投げる。
export function plan(data) {
  const sg = data.stageGen;
  if (!sg) throw new Error('stageGen がない');
  if (sg.ver !== GEN_VERSION) throw new Error(`stageGen.ver=${sg.ver} が生成器の版 GEN_VERSION=${GEN_VERSION} と違う（stageGen.ver を上げて書き直す）`);
  const plays = data.steps.filter((s) => s.kind === 'play');
  const keep = (sg.keepHandwritten ?? []).map((id) => plays.find((p) => p.stepId === id)).filter(Boolean);
  const seen = new Set(keep.map((p) => canonicalKey({ ...p, items: p.items ?? [] })));
  const prev = keep.length > 0 ? handwrittenFace(keep[keep.length - 1]) : null;
  const picked = pickStages(sg, prev, collectCandidates(sg, seen));
  if (!picked.ok) throw new Error(picked.reason);
  return { keep, prev, faces: picked.faces };
}

export function applyPlan(data, { keep, faces }) {
  const sg = data.stageGen;
  const keepIds = new Set(sg.keepHandwritten ?? []);
  const generated = faces.map((f, i) => boardToStep(f.board, `p${keep.length + 1 + i}`, { seed: f.seed, ver: sg.ver }));
  const firstPlay = data.steps.findIndex((s) => s.kind === 'play');
  const rest = data.steps.filter((s) => s.kind !== 'play' || keepIds.has(s.stepId));
  const lastKeep = rest.reduce((acc, s, i) => (s.kind === 'play' ? i : acc), -1);
  const at = lastKeep >= 0 ? lastKeep + 1 : data.steps.slice(0, firstPlay).filter((s) => s.kind !== 'play').length;
  return { ...data, steps: [...rest.slice(0, at), ...generated, ...rest.slice(at)] };
}

async function main() {
  const args = process.argv.slice(2);
  const li = args.indexOf('--lesson');
  const id = li >= 0 ? args[li + 1] : null;
  if (!id) { console.error('使い方: node tools/gen-stages.mjs --lesson <id> [--write]'); process.exit(2); }
  const file = path.join(LESSONS_DIR, `${id}.json`);
  const raw = await readFile(file, 'utf-8');
  const data = JSON.parse(raw);
  let result;
  try {
    result = plan(data);
  } catch (e) {
    console.error(`失敗（書き込まない）: ${e.message}`);
    process.exit(1);
  }
  const next = applyPlan(data, result);
  result.faces.forEach((f, i) => {
    console.log(`p${result.keep.length + 1 + i} seed=${f.seed} 最短=${f.steps} 曲がり角=${f.turns} 盤=${f.board.grid.cols}x${f.board.grid.rows}${f.breath ? ' (一息面)' : ''}`);
    console.log(drawBoard(f.board));
  });
  if (!args.includes('--write')) return;
  const errors = validateLesson(`${id}.json`, next, await readLongTrialIds());
  if (errors.length > 0) {
    for (const e of errors) console.error(e);
    console.error('失敗（書き込まない）: 書き込み後の validate が通らない');
    process.exit(1);
  }
  const text = `${formatLesson(next)}\n`;
  await writeFile(file, raw.includes('\r\n') ? text.replace(/\n/g, '\r\n') : text, 'utf-8');
  console.log(`書き込み: ${file}`);
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) main();
