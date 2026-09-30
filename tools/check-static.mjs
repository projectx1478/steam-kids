// check-static.mjs: ブラウザを使わずにファイルの中身だけで判定できる整合性チェック。
//   node tools/check-static.mjs      （成功時は1行、失敗時は失敗項目のみ出力）
// 1. js/config.js の APP_VERSION と service-worker.js の CACHE_NAME が一致する
// 2. 配信対象ファイル（lessons/*.json を除く）がすべて APP_SHELL に入っており、APP_SHELL の各項目が実在する
//    lessons/*.json はネットワーク優先のランタイムキャッシュなので対象外（docs/caching.md）
// 3. HTML/JS/CSS が外部URLからスクリプト・スタイル・フォント・モジュールを読み込んでいない（CDN禁止）
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const failures = [];
const fail = (msg) => failures.push(msg);
const read = (p) => readFileSync(path.join(ROOT, p), 'utf-8');

function walk(dir, exts) {
  const out = [];
  for (const name of readdirSync(path.join(ROOT, dir))) {
    const rel = path.posix.join(dir, name);
    if (statSync(path.join(ROOT, rel)).isDirectory()) out.push(...walk(rel, exts));
    else if (exts.some((e) => name.endsWith(e))) out.push(rel);
  }
  return out;
}

// 1. バージョン一致
const sw = read('service-worker.js');
const appVersion = read('js/config.js').match(/APP_VERSION\s*=\s*["']([^"']+)["']/)?.[1];
const cacheName = sw.match(/CACHE_NAME\s*=\s*["']([^"']+)["']/)?.[1];
if (!appVersion) fail('js/config.js に APP_VERSION が見つからない');
if (!cacheName) fail('service-worker.js に CACHE_NAME が見つからない');
if (appVersion && cacheName && appVersion !== cacheName) {
  fail(`APP_VERSION(${appVersion}) と CACHE_NAME(${cacheName}) が不一致`);
}

// 2. APP_SHELL の過不足
const shellSrc = sw.match(/APP_SHELL\s*=\s*\[([\s\S]*?)\]/)?.[1];
if (!shellSrc) {
  fail('service-worker.js に APP_SHELL が見つからない');
} else {
  const shell = [...shellSrc.matchAll(/["']([^"']+)["']/g)].map((m) => m[1].replace(/^\.\//, ''));
  const shellSet = new Set(shell);
  for (const entry of shell) {
    if (entry === '') continue; // "./"
    if (!existsSync(path.join(ROOT, entry))) fail(`APP_SHELL の項目が存在しない: ${entry}`);
  }
  const served = [
    'index.html', 'dashboard.html', 'style.css', 'app.js',
    ...walk('js', ['.js']),
    ...walk('fonts', ['.woff2']),
  ];
  for (const f of served) if (!shellSet.has(f)) fail(`APP_SHELL に未登録（オフラインで欠ける）: ${f}`);
}

// 3. 外部読み込み（CDN）禁止。同期APIの fetch 先（config.js の SYNC_ENDPOINT）は対象外
const EXTERNAL = [
  [/<script[^>]+src=["']https?:\/\//i, '<script src> が外部URL'],
  [/<link[^>]+href=["']https?:\/\//i, '<link href> が外部URL'],
  [/\bimport\s[^;]*?from\s*["']https?:\/\//, 'import が外部URL'],
  [/\bimport\(\s*["']https?:\/\//, '動的 import が外部URL'],
  [/@import\s+(url\()?["']?https?:\/\//i, 'CSS @import が外部URL'],
  [/url\(\s*["']?https?:\/\//i, 'CSS url() が外部URL'],
];
const targets = ['index.html', 'dashboard.html', 'app.js', 'service-worker.js', 'tailwind.src.css', ...walk('js', ['.js'])];
for (const f of targets) {
  const src = read(f);
  for (const [re, label] of EXTERNAL) if (re.test(src)) fail(`${f}: ${label}`);
}

if (failures.length) {
  for (const m of failures) console.log(`FAIL ${m}`);
  console.log(`SUMMARY: FAIL ${failures.length} 件`);
  process.exit(1);
}
console.log('SUMMARY: PASS check-static');
