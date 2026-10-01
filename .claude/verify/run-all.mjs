#!/usr/bin/env node
// run-all.mjs: run.mjsを12本ずつのバッチで順番に実行するラッパー
//
// 使い方:
//   node .claude/verify/run-all.mjs              全シナリオ
//   node .claude/verify/run-all.mjs <name>...    指定シナリオのみ（run.mjsと同じ名前指定）
//   --mobile等のフラグはrun.mjsへそのまま渡す
//
// 並列にしない（メモリ不足で停止しやすい端末への配慮）。失敗したバッチは1本ずつ再実行して
// 失敗シナリオを特定し、失敗したものだけ1回リトライする。全出力は.verify/verify-all.log。
// config.mjsのciOnlyが有効なら、手元ではguard.mjsが終了コード2で止める。

import { spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { guardCiOnly } from './guard.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const RUN = path.join(__dirname, 'run.mjs');
const LOG = path.join(ROOT, '.verify', 'verify-all.log');
const BATCH_SIZE = 12;
const BATCH_TIMEOUT_MS = 240000;
const MAX_FAIL_LINES = 5;

async function loadConfig() {
  try {
    const mod = await import(pathToFileURL(path.join(__dirname, 'config.mjs')).href);
    return mod.default || {};
  } catch (e) {
    if (e.code === 'ERR_MODULE_NOT_FOUND') return {};
    throw e;
  }
}

guardCiOnly(await loadConfig());

const args = process.argv.slice(2);
const flags = args.filter((a) => a.startsWith('--'));
const given = args.filter((a) => !a.startsWith('--'));
const names = given.length > 0
  ? given
  : readdirSync(path.join(__dirname, 'scenarios'))
      .filter((f) => f.endsWith('.mjs'))
      .map((f) => f.slice(0, -4))
      .sort();

mkdirSync(path.dirname(LOG), { recursive: true });
writeFileSync(LOG, '');

function run(batch, label) {
  const r = spawnSync(process.execPath, [RUN, ...flags, ...batch], {
    cwd: ROOT,
    encoding: 'utf-8',
    maxBuffer: 256 * 1024 * 1024,
    timeout: BATCH_TIMEOUT_MS,
  });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  appendFileSync(LOG, `\n===== ${label}: ${batch.join(' ')} (exit ${r.status ?? r.signal ?? 'none'}) =====\n${out}`);
  const m = out.match(/^SUMMARY: (PASS|FAIL) (\d+) scenarios \/ (\d+) checks/m);
  return { ok: r.status === 0 && m?.[1] === 'PASS', checks: m ? Number(m[3]) : 0, out };
}

function failLines(out) {
  const fails = out.split(/\r?\n/).filter((l) => l.startsWith('FAIL'));
  if (fails.length > 0) return fails.slice(0, MAX_FAIL_LINES);
  const crash = out.split(/\r?\n/).map((l) => l.trim()).filter((l) => /Error|Timeout|crashed|scenarios[\\/]/.test(l));
  return (crash.length > 0 ? crash : ['(異常終了。verify-all.logを参照)']).slice(0, MAX_FAIL_LINES);
}

const started = Date.now();
let totalChecks = 0;
const flaky = [];
const failed = [];

function runSingle(name) {
  const first = run([name], 'single');
  if (first.ok) {
    totalChecks += first.checks;
    return;
  }
  const second = run([name], 'retry');
  if (second.ok) {
    totalChecks += second.checks;
    flaky.push(name);
    return;
  }
  totalChecks += second.checks;
  failed.push({ name, lines: failLines(second.out) });
}

for (let i = 0; i < names.length; i += BATCH_SIZE) {
  const batch = names.slice(i, i + BATCH_SIZE);
  const r = run(batch, 'batch');
  if (r.ok) {
    totalChecks += r.checks;
    continue;
  }
  for (const name of batch) runSingle(name);
}

const seconds = Math.round((Date.now() - started) / 1000);
const summary = `${names.length} scenarios / ${totalChecks} checks (${seconds}s)`;
for (const name of flaky) console.log(`FLAKY: ${name}`);
for (const f of failed) {
  console.log(`FAILED: ${f.name}`);
  for (const line of f.lines) console.log(`  ${line}`);
}
console.log(failed.length > 0 ? `VERIFY-ALL: FAIL ${summary} (${failed.length} failed)` : `VERIFY-ALL: PASS ${summary}`);
process.exit(failed.length > 0 ? 1 : 0);
