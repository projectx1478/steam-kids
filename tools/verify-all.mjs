#!/usr/bin/env node
// verify-all.mjs: .claude/verify/run.mjsを12本ずつのバッチで順番に実行するラッパー（Issue #126）
//
// 使い方:
//   node tools/verify-all.mjs              全シナリオ
//   node tools/verify-all.mjs <name>...    指定シナリオのみ（run.mjsと同じ名前指定）
//   --mobile等のフラグはrun.mjsへそのまま渡す
//
// 並列にしない（この端末はメモリ不足で停止しやすい）。失敗したバッチは1本ずつ再実行して失敗
// シナリオを特定し、失敗したものだけ1回リトライする。全出力は.verify/verify-all.log。

import { spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 手元実行ガード：E2EはGitHub Actionsで実行する（docs/testing-guidelines.md）。CIか E2E_LOCAL=1 のときだけ動く
if (!process.env.CI && process.env.E2E_LOCAL !== '1') {
  console.error('E2Eは手元で実行しない。GitHub Actionsで実行する:');
  console.error('  gh workflow run e2e-run.yml --ref <ブランチ> -f scenarios="<シナリオ名…>"   （全件は all）');
  console.error('詳細: docs/testing-guidelines.md。明示的に手元実行を指示された場合のみ E2E_LOCAL=1 を付ける');
  process.exit(2);
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RUN = path.join(ROOT, '.claude', 'verify', 'run.mjs');
const LOG = path.join(ROOT, '.verify', 'verify-all.log');
const BATCH_SIZE = 12;
const BATCH_TIMEOUT_MS = 240000;
const MAX_FAIL_LINES = 5;

const args = process.argv.slice(2);
const flags = args.filter((a) => a.startsWith('--'));
const given = args.filter((a) => !a.startsWith('--'));
const names = given.length > 0
  ? given
  : readdirSync(path.join(ROOT, '.claude', 'verify', 'scenarios'))
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
