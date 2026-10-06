// verify-fast.mjs: 軽量検証（check:static → validate:lessons → test:unit:core、生成まわり変更時は test:unit:generate も）を1コマンドで回す。
//   npm run verify:fast        （全体のタイムアウト300秒。各段の成否と所要時間だけ出力。失敗時は要約のみ）
//   npm run verify:fast -- --with-generate   （生成テストを強制的に含める）
// 実行する npm スクリプトの中身は package.json が正本（ここでは複製しない）。E2E は含まない。
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE_STAGES = ['check:static', 'validate:lessons', 'test:unit:core'];
const GENERATE_STAGE = 'test:unit:generate';
const TOTAL_MS = 300_000;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// 生成まわりのパス（これらに変更があれば test:unit:generate も回す）。'/' 区切りで比較する。
export const GENERATE_PATHS = {
  files: ['js/engine-generate.js', 'js/engine-grid.js', 'package.json', 'tools/verify-fast.mjs', 'tools/test-unit-core.mjs'],
  dirs: ['js/gimmicks/'],
  prefixes: ['test/engine-generate'],
};

export function isGeneratePath(file) {
  const p = String(file).replace(/\\/g, '/').replace(/^\.\//, '');
  return GENERATE_PATHS.files.includes(p)
    || GENERATE_PATHS.dirs.some((d) => p.startsWith(d))
    || GENERATE_PATHS.prefixes.some((x) => p.startsWith(x));
}

// changedFiles: 変更ファイル配列。検知失敗なら null。
export function decideGenerate({ withFlag = false, changedFiles = null } = {}) {
  if (withFlag) return { include: true, reason: '--with-generate' };
  if (changedFiles === null) return { include: true, reason: '検知失敗' };
  if (changedFiles.some(isGeneratePath)) return { include: true, reason: '変更検知' };
  return { include: false, reason: '変更なし' };
}

function git(args) {
  const r = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
  if (r.error || r.status !== 0) return null;
  return r.stdout.split(/\r?\n/).filter(Boolean);
}

// origin/main との merge-base からの差分（作業ツリー含む）＋未追跡ファイル。失敗なら null。
export function detectChangedFiles() {
  const base = git(['merge-base', 'HEAD', 'origin/main']);
  if (!base || !base[0]) return null;
  const diff = git(['diff', '--name-only', base[0]]);
  const untracked = git(['ls-files', '--others', '--exclude-standard']);
  if (!diff || !untracked) return null;
  return [...new Set([...diff, ...untracked])];
}
const FAIL_MARK = /^\s*(✖|not ok)\s/;

function killTree(child) {
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    try { process.kill(-child.pid, 'SIGKILL'); } catch { /* 既に終了 */ }
  }
}

function runStage(name, budgetMs) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(`npm run ${name}`, {
      shell: true,
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    let timedOut = false;
    child.stdout.on('data', (d) => { output += d; });
    child.stderr.on('data', (d) => { output += d; });
    const timer = setTimeout(() => { timedOut = true; killTree(child); }, budgetMs);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ name, ok: code === 0 && !timedOut, timedOut, ms: Date.now() - started, output });
    });
  });
}

function summarize(output) {
  const lines = output.split(/\r?\n/);
  const failed = [...new Set(lines.filter((l) => FAIL_MARK.test(l)).map((l) => l.trim()))].slice(0, 10);
  const first = lines.findIndex((l) => FAIL_MARK.test(l));
  const head = (first >= 0 ? lines.slice(first) : lines.slice(-20)).slice(0, 20);
  return { failed, head };
}

const sec = (ms) => (ms / 1000).toFixed(1);

async function main() {
const withFlag = process.argv.includes('--with-generate');
const decision = decideGenerate({ withFlag, changedFiles: withFlag ? [] : detectChangedFiles() });
console.log(`${decision.include ? '生成テストを含める' : '生成テストを除く'}（${decision.reason}）`);
const STAGES = decision.include ? [...BASE_STAGES, GENERATE_STAGE] : BASE_STAGES;
const t0 = Date.now();
let exitCode = 0;

for (const name of STAGES) {
  const left = TOTAL_MS - (Date.now() - t0);
  if (left <= 0) {
    console.log(`SKIP ${name}（全体タイムアウト）`);
    exitCode = 1;
    continue;
  }
  const r = await runStage(name, left);
  console.log(`${r.ok ? 'PASS' : 'FAIL'} ${name} ${sec(r.ms)}s${r.timedOut ? '（タイムアウト）' : ''}`);
  if (!r.ok) {
    exitCode = 1;
    const { failed, head } = summarize(r.output);
    if (failed.length) console.log(failed.map((l) => `  ${l}`).join('\n'));
    console.log(head.map((l) => `  | ${l}`).join('\n'));
    break;
  }
}

console.log(`${exitCode === 0 ? 'OK' : 'NG'} 合計 ${sec(Date.now() - t0)}s`);
process.exit(exitCode);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) await main();
