// test-unit-core.mjs: 単体テストを「生成テスト以外（core）」と「生成テスト（generate）」に分けて実行する。
//   node tools/test-unit-core.mjs                  （core: engine-generate* 以外の全 test/*.test.mjs）
//   node tools/test-unit-core.mjs --only-generate  （generate: engine-generate* のみ）
// 出力・終了コードは node --test のまま。CI は従来どおり test:unit（全件）を使う。
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEST_DIR = path.join(ROOT, 'test');

export const isGenerateTest = (file) => file.startsWith('engine-generate');

// test/ 直下の *.test.mjs のファイル名（ソート済み）。generate=true なら生成テストのみ、false なら生成テストを除く。
export function listTests({ generate = false, dir = TEST_DIR } = {}) {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.test.mjs') && isGenerateTest(f) === generate)
    .sort();
}

function main() {
  const generate = process.argv.includes('--only-generate');
  const files = listTests({ generate }).map((f) => path.join('test', f));
  const r = spawnSync(process.execPath, ['--test', ...files], { cwd: ROOT, stdio: 'inherit' });
  process.exit(r.status ?? 1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
