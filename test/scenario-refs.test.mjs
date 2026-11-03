// シナリオ（.claude/verify/scenarios）の js 参照の検査（#666）。
// 注釈の「識別子（js/x.js」・import 先・import した名前が、実在する js と export に合っているかを見る。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCENARIO_DIR = path.join(ROOT, '.claude', 'verify', 'scenarios');

const ID = '[A-Za-z_$][\\w$]*';
const JS_PATH = 'js\\/[\\w\\/-]+\\.js';
const esc = (s) => s.replace(/[$]/g, '\\$');

// x.js で名前が「定義」されているか（分割代入・呼び出し・コメントは数えない）
function isDefined(src, name) {
  const n = esc(name);
  return (
    new RegExp(`\\bfunction\\s*\\*?\\s*${n}\\b`).test(src) ||
    new RegExp(`\\b(?:const|let|var)\\s+${n}\\s*=`).test(src) ||
    new RegExp(`\\bclass\\s+${n}\\b`).test(src) ||
    isExported(src, name)
  );
}

// x.js の export に名前があるか
function isExported(src, name) {
  const n = esc(name);
  if (new RegExp(`\\bexport\\s+(?:async\\s+)?(?:function\\s*\\*?|const|let|var|class)\\s+${n}\\b`).test(src)) return true;
  for (const m of src.matchAll(/\bexport\s*\{([^}]*)\}/g)) {
    for (const part of m[1].split(',')) {
      const [orig, alias] = part.trim().split(/\s+as\s+/);
      if ((alias ?? orig) === name) return true;
    }
  }
  return false;
}

// "a, b: c, d as e" の左側の名前を返す
function leftNames(list) {
  return list
    .split(',')
    .map((s) => s.trim().split(/\s*(?::|\s+as\s+)\s*/)[0])
    .filter((s) => new RegExp(`^${ID}$`).test(s));
}

const toJsPath = (p) => (p.match(new RegExp(`${JS_PATH}$`)) || [])[0] || null;

// scenarios: [{name, text}]、readJs: 'js/x.js' -> 本文 または null。エラー文字列の配列を返す
export function checkScenarioRefs(scenarios, readJs) {
  const errors = [];
  const cache = new Map();
  const read = (p) => {
    if (!cache.has(p)) cache.set(p, readJs(p));
    return cache.get(p);
  };
  for (const { name, text } of scenarios) {
    const err = (msg) => errors.push(`${name}: ${msg}`);
    // 4: 裸の js/x.js（存在のみ）。import 先もここで存在検査になる
    for (const m of text.matchAll(new RegExp(`(?<![\\w.-])(${JS_PATH})(?![\\w-])`, 'g'))) {
      if (read(m[1]) == null) err(`${m[1]} が存在しない`);
    }
    // 1: 識別子（js/x.js
    for (const m of text.matchAll(new RegExp(`(${ID})（(${JS_PATH})`, 'g'))) {
      const src = read(m[2]);
      if (src != null && !isDefined(src, m[1])) err(`${m[1]} が ${m[2]} で定義されていない`);
    }
    // 3: import した名前が export にあること
    const checkNames = (names, p) => {
      const jsPath = toJsPath(p);
      const src = jsPath && read(jsPath);
      if (!src || /\bexport\s*\*\s*from\b/.test(src)) return;
      for (const nm of names) if (!isExported(src, nm)) err(`${nm} が ${jsPath} の export にない`);
    };
    for (const m of text.matchAll(/const\s*\{([^}]*)\}\s*=\s*await\s+import\(\s*(['"`])([^'"`]+)\2\s*\)/g)) checkNames(leftNames(m[1]), m[3]);
    for (const m of text.matchAll(new RegExp(`\\(\\s*await\\s+import\\(\\s*(['"\`])([^'"\`]+)\\1\\s*\\)\\s*\\)\\.(${ID})`, 'g'))) checkNames([m[3]], m[2]);
    for (const m of text.matchAll(/\bimport\s*\{([^}]*)\}\s*from\s*(['"])([^'"]+)\2/g)) checkNames(leftNames(m[1]), m[3]);
  }
  return errors;
}

const files = (map) => (p) => (p in map ? map[p] : null);
const one = (text) => [{ name: 't.mjs', text }];

test('合格：入れ子の function 定義と export は通る', () => {
  const js = files({
    'js/ui-play-queue.js': 'function a() {\n  function updateControls() {}\n}',
    'js/guardian.js': 'export async function ensureGuardianToken() {}',
    'js/bird-phrases.js': 'export const PHRASES = {};\nexport { x as Y };',
  });
  const text = [
    '// updateControls（js/ui-play-queue.js の設定行）',
    '// ensureGuardianToken（js/guardian.js）',
    "const { ensureGuardianToken: e } = await import('/js/guardian.js');",
    "import { PHRASES, Y } from '../../../js/bird-phrases.js';",
    "const v = (await import('./js/guardian.js')).ensureGuardianToken;",
  ].join('\n');
  assert.deepEqual(checkScenarioRefs(one(text), js), []);
});

test('不合格：存在しない js', () => {
  const e = checkScenarioRefs(one("await import('/js/nothing.js')"), files({}));
  assert.equal(e.length, 1);
  assert.match(e[0], /nothing\.js が存在しない/);
});

test('不合格：無い export 名（分割代入・静的 import・(await import).x）', () => {
  const js = files({ 'js/a.js': 'export const real = 1;' });
  const text = [
    "const {\n  real,\n  ghost1,\n} = await import('/js/a.js');",
    "import { ghost2 as g } from '../../../js/a.js';",
    "(await import('/js/a.js')).ghost3;",
  ].join('\n');
  const e = checkScenarioRefs(one(text), js);
  assert.equal(e.length, 3);
  for (const n of ['ghost1', 'ghost2', 'ghost3']) assert.ok(e.some((x) => x.includes(n)), n);
});

test('不合格：呼び出しと分割代入だけが残る本文では定義とみなさない（c12 の再現）', () => {
  const js = files({
    'js/ui-play.js': 'const { a, updateControls, b } = ctx.fn;\nfunction f() { updateControls(); }\n// updateControls',
  });
  const e = checkScenarioRefs(one('// 命令0個では updateControls（js/ui-play.js の設定行）が'), js);
  assert.equal(e.length, 1);
  assert.match(e[0], /updateControls が js\/ui-play\.js で定義されていない/);
});

test('export * from を含む js は名前検査を飛ばす', () => {
  const js = files({ 'js/a.js': "export * from './b.js';" });
  assert.deepEqual(checkScenarioRefs(one("import { any } from '../../../js/a.js';"), js), []);
});

test('実ファイル：全シナリオの js 参照が実在する定義・export に合う', () => {
  const scenarios = fs
    .readdirSync(SCENARIO_DIR)
    .filter((f) => f.endsWith('.mjs'))
    .map((f) => ({ name: f, text: fs.readFileSync(path.join(SCENARIO_DIR, f), 'utf8') }));
  const readJs = (p) => {
    const full = path.join(ROOT, p);
    return fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : null;
  };
  // 空振り防止
  const withRef = scenarios.filter((s) => new RegExp(`(?<![\\w.-])${JS_PATH}`).test(s.text));
  assert.ok(withRef.length >= 20, `js 参照を持つシナリオが少ない: ${withRef.length}`);
  const idRefs = scenarios.reduce((n, s) => n + [...s.text.matchAll(new RegExp(`${ID}（${JS_PATH}`, 'g'))].length, 0);
  assert.ok(idRefs >= 5, `「識別子（js/x.js」が少ない: ${idRefs}`);
  assert.deepEqual(checkScenarioRefs(scenarios, readJs), []);
});
