// affected-scenarios.mjs: 変更に関係する E2E シナリオ名を出す。
//   node tools/affected-scenarios.mjs --diff                 （git diff --name-only origin/main...HEAD）
//   node tools/affected-scenarios.mjs --files <パス…>         （ファイル一覧。寸法変更の判定はファイル名だけ）
//   node tools/affected-scenarios.mjs <語…>                  （data-* 属性・id・クラス・関数名）
// js 等（isRuntimeFile）の変更では rough-grid を足す（Issue #768）。
// .claude/verify/scenarios/*.mjs を grep して該当シナリオ名を出す。出力は `E2E:` 行。12本超は別行「手動実行」。
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCENARIO_DIR = path.join(ROOT, '.claude', 'verify', 'scenarios');
export const MAX_E2E = 12;
export const DIMENSION_SCENARIOS = ['c7-board-fit', 'c10-result-gap', 'c14-no-overlap'];
export const ROUGH_SCENARIO = 'rough-grid';
const DIMENSION_RE = /\b(max-width|width|height|grid|gap)\b/;
const TAILWIND_SRC = 'tailwind.src.css';

// grid-runtime の画面に関わるファイルか（js・app.js・index.html・CSS。vendor・他の型・保護者画面は除く）。
export function isRuntimeFile(p) {
  const norm = String(p).replace(/\\/g, '/');
  if (['app.js', 'index.html', 'tailwind.src.css', 'style.css'].includes(norm)) return true;
  if (!/^js\/.+\.js$/.test(norm) || norm.startsWith('js/vendor/')) return false;
  return !/(buoyancy|seesaw|egg|sortorder|unfold|predict|dashboard)/.test(path.posix.basename(norm));
}

export function loadScenarios(dir = SCENARIO_DIR) {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.mjs'))
    .sort()
    .map((f) => ({ name: f.replace(/\.mjs$/, ''), text: readFileSync(path.join(dir, f), 'utf-8') }));
}

// 検索語を、ファイルパスから作る（ベース名と拡張子なしの名前）。
function termsFromFile(file) {
  const base = path.posix.basename(file.replace(/\\/g, '/'));
  return [base];
}

// scenarios: [{name, text}]。files: 変更ファイル。words: 追加の語。dimensionChanged: 寸法行の変更があるか。
export function findAffected({ scenarios, files = [], words = [], dimensionChanged = false }) {
  const hit = new Set();
  const terms = new Set(words.filter(Boolean));
  for (const f of files) {
    const norm = f.replace(/\\/g, '/');
    const m = norm.match(/^\.claude\/verify\/scenarios\/(.+)\.mjs$/);
    if (m) hit.add(m[1]);
    // style.css は生成物。語としては拾わない（tailwind.src.css で判定する）
    if (norm === 'style.css' || norm === TAILWIND_SRC) continue;
    if (norm.startsWith('.claude/') || norm.startsWith('docs/') || norm.startsWith('review/')) continue;
    for (const t of termsFromFile(norm)) terms.add(t);
  }
  for (const s of scenarios) {
    for (const t of terms) if (s.text.includes(t)) { hit.add(s.name); break; }
  }
  if (dimensionChanged) for (const n of DIMENSION_SCENARIOS) if (scenarios.some((s) => s.name === n)) hit.add(n);
  if (files.some(isRuntimeFile) && scenarios.some((s) => s.name === ROUGH_SCENARIO)) hit.add(ROUGH_SCENARIO);
  return [...hit].sort();
}

export function formatOutput(names) {
  if (!names.length) return 'E2E: （該当なし）';
  const run = names.slice(0, MAX_E2E);
  const lines = [`E2E: ${run.join(' ')}`];
  const rest = names.slice(MAX_E2E);
  if (rest.length) lines.push(`手動実行（12本超過分）: ${rest.join(' ')}`);
  return lines.join('\n');
}

function gitOut(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 });
}

// tailwind.src.css の差分に寸法行（追加・削除行）があるか。
export function hasDimensionDiff(diffText) {
  return diffText.split(/\r?\n/).some((l) => /^[+-](?![+-])/.test(l) && DIMENSION_RE.test(l));
}

function main() {
  const args = process.argv.slice(2);
  let files = [];
  let words = [];
  let dimensionChanged = false;
  if (args[0] === '--diff') {
    files = gitOut(['--no-pager', 'diff', '--name-only', 'origin/main...HEAD']).split(/\r?\n/).filter(Boolean);
    if (files.includes(TAILWIND_SRC)) {
      dimensionChanged = hasDimensionDiff(gitOut(['--no-pager', 'diff', '-U0', 'origin/main...HEAD', '--', TAILWIND_SRC]));
    }
  } else if (args[0] === '--files') {
    files = args.slice(1);
    dimensionChanged = files.some((f) => f.replace(/\\/g, '/') === TAILWIND_SRC);
  } else if (args.length) {
    words = args;
  } else {
    console.error('使い方: node tools/affected-scenarios.mjs --diff | --files <パス…> | <語…>');
    process.exit(2);
  }
  console.log(formatOutput(findAffected({ scenarios: loadScenarios(), files, words, dimensionChanged })));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
