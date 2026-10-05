// verify-fast.mjs: 軽量検証（check:static → validate:lessons → test:unit）を1コマンドで回す。
//   npm run verify:fast        （全体のタイムアウト240秒。各段の成否と所要時間だけ出力。失敗時は要約のみ）
// 実行する npm スクリプトの中身は package.json が正本（ここでは複製しない）。E2E は含まない。
import { spawn, spawnSync } from 'node:child_process';

const STAGES = ['check:static', 'validate:lessons', 'test:unit'];
const TOTAL_MS = 240_000;
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
