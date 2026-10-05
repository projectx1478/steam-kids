// analyze-board.mjs: 盤面の最短手数・別解の本数・探索規模を測る（使い方は docs/tools.md）。
//   node tools/analyze-board.mjs <レッスンID> <ステージ番号|stepId> [--timeout 秒] [--limit 本数]
//   node tools/analyze-board.mjs --board <盤のJSONファイル>          [--timeout 秒] [--limit 本数]
// 最短手数・訪問状態数は js/engine-grid.js の shortestSteps/shortestChips を使う（探索は複製しない）。
// 別解は「命令列を深さ優先で列挙し simulate+isRunCleared で数える」（壁衝突・塗りはみ出しの枝は打ち切り）。
// 別解の列挙は limit 本・時間切れで打ち切る。最短の探索（BFS）は別プロセスで走らせ、timeout で強制終了する。
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { simulate, shortestSteps, shortestChips, boardSpec, isRunCleared } from '../js/engine-grid.js';

const DEFAULT_TIMEOUT_SEC = 60;
const DEFAULT_LIMIT = 1000;
const FOUR_DIRS = ['up', 'down', 'left', 'right'];

// レッスンJSONの play ステージを取り出す。stage は 1 始まりの番号（playのみ数える）か stepId。
export function loadPlay(lessonId, stage, root = process.cwd()) {
  const lesson = JSON.parse(readFileSync(`${root}/lessons/${lessonId}.json`, 'utf-8'));
  const plays = lesson.steps.filter((s) => s.kind === 'play');
  const play = /^\d+$/.test(String(stage)) ? plays[Number(stage) - 1] : plays.find((s) => s.stepId === String(stage));
  if (!play) throw new Error(`${lessonId} に play ステージ ${stage} がありません（playは${plays.length}個: ${plays.map((p) => p.stepId).join(',')}）`);
  return play;
}

// 最短手数（groupRepeats は最小チップ数。repeatBox は箱なしの最短手数）と訪問状態数。
export function analyzeShortest(play) {
  const spec = boardSpec(play);
  if (play.groupRepeats === true) return { shortest: shortestChips(spec), unit: 'チップ', visited: null };
  const stats = {};
  const shortest = shortestSteps(spec, stats);
  return { shortest, unit: play.repeatBox === true ? '手（箱なし）' : '手', visited: stats.visited };
}

// maxCommands 以内でクリアする命令列を深さ優先で数える。limit 本・deadline（epoch ms）で打ち切る。
export function countAlternatives(play, { limit = DEFAULT_LIMIT, deadline = Infinity } = {}) {
  if (play.repeatBox === true || play.groupRepeats === true) return { count: null, truncated: false, reason: 'repeatBox/groupRepeats は対象外', nodes: 0 };
  const spec = boardSpec(play);
  const cmds = Array.isArray(play.allowedCommands) ? play.allowedCommands : FOUR_DIRS;
  const max = play.maxCommands;
  let count = 0;
  let nodes = 0;
  let reason = null;
  const dfs = (seq) => {
    if (reason) return;
    if (count >= limit) { reason = `${limit}本で打ち切り`; return; }
    if ((nodes & 255) === 0 && Date.now() >= deadline) { reason = '時間切れ'; return; }
    nodes += 1;
    const r = simulate(seq, spec);
    if (r.blockedAt.length > 0 || r.paintOver.length > 0) return;
    if (isRunCleared(r)) count += 1;
    if (seq.length >= max) return;
    for (const c of cmds) dfs([...seq, c]);
  };
  dfs([]);
  return { count, truncated: reason !== null, reason, nodes };
}

function parseArgs(argv) {
  const opt = { timeout: DEFAULT_TIMEOUT_SEC, limit: DEFAULT_LIMIT, board: null, pos: [], worker: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--timeout') opt.timeout = Number(argv[++i]);
    else if (a === '--limit') opt.limit = Number(argv[++i]);
    else if (a === '--board') opt.board = argv[++i];
    else if (a === '--worker') opt.worker = true;
    else opt.pos.push(a);
  }
  return opt;
}

// 子プロセス：結果を1行ずつJSONで標準出力へ（途中で強制終了されても出た分は親が読める）。
function runWorker(opt) {
  const play = JSON.parse(process.env.ANALYZE_PLAY);
  const deadline = Number(process.env.ANALYZE_DEADLINE);
  const t0 = Date.now();
  const s = analyzeShortest(play);
  console.log(JSON.stringify({ phase: 'shortest', ...s, ms: Date.now() - t0 }));
  const t1 = Date.now();
  const a = countAlternatives(play, { limit: opt.limit, deadline });
  console.log(JSON.stringify({ phase: 'alts', ...a, ms: Date.now() - t1 }));
}

function main() {
  const opt = parseArgs(process.argv.slice(2));
  if (opt.worker) return runWorker(opt);
  let play;
  let label;
  if (opt.board) {
    play = JSON.parse(readFileSync(opt.board, 'utf-8'));
    label = opt.board;
  } else if (opt.pos.length === 2) {
    play = loadPlay(opt.pos[0], opt.pos[1]);
    label = `${opt.pos[0]} ${play.stepId}`;
  } else {
    console.error('使い方: node tools/analyze-board.mjs <レッスンID> <ステージ番号|stepId>  または  --board <JSON>  [--timeout 秒] [--limit 本数]');
    process.exit(2);
  }
  const timeoutMs = opt.timeout * 1000;
  const start = Date.now();
  const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--worker', '--limit', String(opt.limit)], {
    env: { ...process.env, ANALYZE_PLAY: JSON.stringify(play), ANALYZE_DEADLINE: String(start + timeoutMs - 1000) },
    encoding: 'utf-8',
    timeout: timeoutMs,
  });
  const out = {};
  for (const line of (r.stdout ?? '').split('\n')) if (line.trim()) { const o = JSON.parse(line); out[o.phase] = o; }
  const timedOut = r.error?.code === 'ETIMEDOUT';
  console.log(`盤: ${label}（maxCommands=${play.maxCommands ?? '未指定'}）`);
  if (out.shortest) {
    console.log(`最短手数: ${out.shortest.shortest === null || out.shortest.shortest === Infinity || out.shortest.shortest === undefined ? '到達不能' : out.shortest.shortest}${out.shortest.unit}（${(out.shortest.ms / 1000).toFixed(2)}s）`);
    console.log(`訪問状態数: ${out.shortest.visited ?? '不明（groupRepeats）'}`);
  } else {
    console.log(`最短手数: 打ち切り（${opt.timeout}秒のタイムアウトで最短の探索が終わらなかった）`);
  }
  if (out.alts) {
    const a = out.alts;
    console.log(`別解: ${a.count === null ? `対象外（${a.reason}）` : `${a.count}本${a.truncated ? `（打ち切り: ${a.reason}。実際はこれ以上）` : ''}`}（探索${a.nodes}ノード、${(a.ms / 1000).toFixed(2)}s）`);
  } else if (out.shortest) {
    console.log(`別解: 打ち切り（${opt.timeout}秒のタイムアウト）`);
  }
  console.log(`所要時間: ${((Date.now() - start) / 1000).toFixed(2)}s${timedOut ? '（タイムアウトで強制終了）' : ''}`);
  if (r.status !== 0 && !timedOut) { console.error(r.stderr); process.exit(1); }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
