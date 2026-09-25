#!/usr/bin/env node
// run.mjs: .claude/verify/scenarios/*.mjs を実行する検証ハーネス
//
// 使い方:
//   node .claude/verify/run.mjs             全シナリオ実行（既定: 失敗のみ出力）
//   node .claude/verify/run.mjs <name>...   指定シナリオのみ（scenarios/<name>.mjs）
//   node .claude/verify/run.mjs --mobile    ビューポート375x667（既定は1280x800）
//   node .claude/verify/run.mjs --verbose   シナリオ見出し・PASS行も出力
//   node .claude/verify/run.mjs --shot      shot()で実際にPNGを撮影する（既定はno-op）
//
// シナリオ書式・フィクスチャの置き場所は .claude/verify/README.md を参照。
//
// 拡張フック（.claude/verify/config.mjs、任意・本ファイルの配布対象外）:
// ビルドステップを持つ・外部リソースの既定固定が要る等、リポジトリ固有の事情がある場合のみ置く。
// 無ければ従来通り動く。書式は .claude/verify/README.md の「拡張フック」を参照。

import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, readdir, mkdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const SCENARIOS_DIR = path.join(__dirname, 'scenarios');
const SHOT_DIR = path.join(ROOT, '.verify');
const CONFIG_PATH = path.join(__dirname, 'config.mjs');

// config.mjs（任意・非配布）: distDir・beforeAll・setupRoutesを上書きできる。無ければ既定のまま動く。
async function loadConfig() {
  try {
    const mod = await import(pathToFileURL(CONFIG_PATH).href);
    return mod.default || {};
  } catch (e) {
    if (e.code === 'ERR_MODULE_NOT_FOUND') return {};
    throw e;
  }
}

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.jpg': 'image/jpeg',
};

const RETRY_TIMEOUT_MS = 2000;
const RETRY_INTERVAL_MS = 100;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const isEqual = (actual, expected) =>
  expected !== null && typeof expected === 'object'
    ? JSON.stringify(actual) === JSON.stringify(expected)
    : actual === expected;

function resolvePlaywright() {
  try {
    return require('playwright');
  } catch {
    const globalRoot = execSync('npm root -g').toString().trim();
    return require(path.join(globalRoot, 'playwright'));
  }
}

function startServer(serveRoot) {
  const server = createServer(async (req, res) => {
    const urlPath = req.url === '/' ? '/index.html' : decodeURIComponent(req.url.split('?')[0]);
    const filePath = path.join(serveRoot, urlPath);
    if (!filePath.startsWith(serveRoot)) { res.writeHead(403); res.end(); return; }
    try {
      const data = await readFile(filePath);
      res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end('not found');
    }
  });
  return new Promise((resolve) => server.listen(0, () => resolve(server)));
}

async function loadScenarios(names) {
  const files = names.length > 0
    ? names.map((n) => `${n}.mjs`)
    : (await readdir(SCENARIOS_DIR)).filter((f) => f.endsWith('.mjs'));
  const scenarios = [];
  for (const file of files) {
    const mod = await import(pathToFileURL(path.join(SCENARIOS_DIR, file)).href);
    scenarios.push({ id: path.basename(file, '.mjs'), name: mod.name || file, run: mod.default });
  }
  return scenarios;
}

async function runScenario(scenario, { browser, baseUrl, mobile, verbose, shotEnabled, stats, setupRoutes }) {
  const autoFails = [];
  const context = await browser.newContext({
    baseURL: baseUrl,
    viewport: mobile ? { width: 375, height: 667 } : { width: 1280, height: 800 },
    // Service Worker登録によるcontrollerchange自動リロード(app.js/ui-dashboard.js)が
    // シナリオ側のpage.reload()と競合しframeをdetachさせるため、検証では登録自体をブロックする
    // (Issue #28)。sw-routing.mjsは実登録せずソースを疑似環境で読むため影響しない。
    serviceWorkers: 'block',
  });
  const page = await context.newPage();
  page.on('console', (msg) => { if (msg.type() === 'error') autoFails.push(`console.error: ${msg.text()}`); });
  page.on('pageerror', (err) => autoFails.push(`pageerror: ${err.message}`));
  page.on('response', (res) => { if (res.status() >= 400) autoFails.push(`HTTP ${res.status()}: ${res.url()}`); });
  if (setupRoutes) await setupRoutes(page);

  let ok = true;
  // check(説明, fn): fnが真偽値を返す（従来形式）
  // check(説明, fn, expected): fnの返り値をexpectedと比較。不一致時に expected/actual を出力
  // 判定成立まで最大2秒（100ms間隔）ポーリングし、フレークによる誤FAILを防ぐ
  const check = async (desc, fn, ...rest) => {
    const hasExpected = rest.length > 0;
    const expected = rest[0];
    const start = Date.now();
    let actual;
    let matched = false;
    let threw = null;
    while (true) {
      try {
        actual = await fn();
        threw = null;
        matched = hasExpected ? isEqual(actual, expected) : Boolean(actual);
      } catch (e) {
        threw = e;
        matched = false;
      }
      if (matched || Date.now() - start >= RETRY_TIMEOUT_MS) break;
      await sleep(RETRY_INTERVAL_MS);
    }

    stats.totalChecks += 1;
    if (matched) {
      if (verbose) console.log(`PASS ${desc}`);
      return;
    }

    ok = false;
    stats.totalFailedChecks += 1;
    if (threw) {
      autoFails.push(`assertion error (${desc}): ${threw.message}`);
      console.log(`FAIL ${desc}`);
    } else if (hasExpected) {
      console.log(`FAIL ${desc} | expected: ${JSON.stringify(expected)} | actual: ${JSON.stringify(actual)}`);
    } else {
      console.log(`FAIL ${desc}`);
    }
  };
  const shot = async (label) => {
    if (!shotEnabled) return;
    await mkdir(SHOT_DIR, { recursive: true });
    const file = path.join(SHOT_DIR, `${scenario.id}-${label}.png`);
    await page.screenshot({ path: file });
    console.log(`SHOT ${path.relative(ROOT, file)}`);
  };
  const fixture = (name) => JSON.parse(readFileSync(path.join(__dirname, 'fixtures', `${name}.json`), 'utf-8'));

  await scenario.run({ page, check, shot, fixture });
  await context.close();

  for (const f of autoFails) console.log(`FAIL (auto) ${f}`);
  return ok && autoFails.length === 0;
}

async function main() {
  const args = process.argv.slice(2);
  const FLAGS = new Set(['--mobile', '--verbose', '--shot']);
  const mobile = args.includes('--mobile');
  const verbose = args.includes('--verbose');
  const shotEnabled = args.includes('--shot');
  const names = args.filter((a) => !FLAGS.has(a));

  const config = await loadConfig();
  if (config.beforeAll) await config.beforeAll({ root: ROOT, verbose });
  const serveRoot = config.distDir ? path.join(ROOT, config.distDir) : ROOT;

  const playwright = resolvePlaywright();
  const server = await startServer(serveRoot);
  const baseUrl = `http://localhost:${server.address().port}/`;
  const browser = await playwright.chromium.launch();

  let anyFailed = false;
  const stats = { totalChecks: 0, totalFailedChecks: 0 };
  try {
    const scenarios = await loadScenarios(names);
    for (const scenario of scenarios) {
      if (verbose) console.log(`=== ${scenario.name} (${scenario.id}) ===`);
      const passed = await runScenario(scenario, {
        browser, baseUrl, mobile, verbose, shotEnabled, stats, setupRoutes: config.setupRoutes,
      });
      if (!passed) anyFailed = true;
    }

    const summary = `${scenarios.length} scenarios / ${stats.totalChecks} checks`;
    console.log(
      anyFailed
        ? `SUMMARY: FAIL ${summary} (${stats.totalFailedChecks} failed)`
        : `SUMMARY: PASS ${summary}`
    );
  } finally {
    await browser.close();
    server.close();
  }

  process.exit(anyFailed ? 1 : 0);
}

main();
