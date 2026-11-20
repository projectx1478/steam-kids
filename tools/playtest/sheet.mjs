// 紙芝居：grid-runtime の1レッスンを6コマ（sheet.png）と見える文字（sheet.txt）にする（Issue #766）。AIは使わない。
// 使い方: node tools/playtest/sheet.mjs <lessonId> [--root <dir>] [--out <dir>]（npm run sheet -- <lessonId>）
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pickNaiveFailPlay } from './naive.mjs';

const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const WAIT = 15000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TITLES = ['最初の画面', '最初の操作後', '素直な手で失敗した直後', 'その1.5秒後の手がかり', 'クリア直後', '次の面の最初'];
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg' };

function resolvePlaywright() {
  try { return require('playwright'); } catch { return require(path.join(execSync('npm root -g').toString().trim(), 'playwright')); }
}

function parseArgs(argv) {
  const a = { lessonId: null, root: REPO, out: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--root') a.root = path.resolve(argv[(i += 1)] ?? '');
    else if (argv[i] === '--out') a.out = path.resolve(argv[(i += 1)] ?? '');
    else if (!argv[i].startsWith('--') && !a.lessonId) a.lessonId = argv[i];
    else return null;
  }
  if (!a.lessonId || !/^[A-Za-z0-9_-]+$/.test(a.lessonId)) return null;
  a.out ??= path.join(REPO, '.verify', 'sheet', a.lessonId);
  return a;
}

function startServer(root) {
  const server = createServer(async (req, res) => {
    const urlPath = req.url === '/' ? '/index.html' : decodeURIComponent(req.url.split('?')[0]);
    const filePath = path.join(root, urlPath);
    if (!filePath.startsWith(root)) { res.writeHead(403); res.end(); return; }
    try {
      const data = await readFile(filePath);
      res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
      res.end(data);
    } catch { res.writeHead(404); res.end('not found'); }
  });
  return new Promise((resolve) => server.listen(0, () => resolve(server)));
}

const runLen = (cmds) => {
  const out = [];
  for (const c of cmds) (out.at(-1)?.[0] === c ? out.at(-1) : out[out.push([c, 0]) - 1])[1] += 1;
  return out.map(([c, n]) => `${c}×${n}`).join(' ');
};
const stringsOf = (play) => {
  const sol = Array.isArray(play.solution) ? play.solution : play.solution?.commands ?? [];
  if (sol.some((c) => typeof c !== 'string')) throw new Placard('撮れず：solution に文字列以外');
  return sol;
};
class Placard extends Error {}

const visibleText = (page) => page.evaluate(() => document.body.innerText).then((t) => {
  const lines = [];
  for (const raw of t.split('\n')) {
    const l = raw.trim();
    if (l && l !== lines.at(-1)) lines.push(l);
  }
  return lines.slice(0, 40).join('\n');
});

async function waitFor(page, sel) {
  try { await page.waitForSelector(sel, { timeout: WAIT }); } catch { throw new Placard(`撮れず：${sel} が出ない`); }
}
async function clearAll(page) {
  const c = page.locator('[data-action="clear-all"]');
  if ((await c.count()) > 0 && (await c.first().isEnabled())) await c.first().click();
}
const stepId = (page) => page.getAttribute('#stage', 'data-step-id');
const stepKind = (page) => page.getAttribute('#stage', 'data-step');

// 現在の面（play）をクリアして次へ進む。
async function solveAndNext(page, play) {
  const sol = stringsOf(play);
  await clearAll(page);
  for (const c of sol) await page.click(`[data-command="${c}"]`);
  await page.click('[data-action="run"]');
  await waitFor(page, '[data-action="next-stage"], [data-action="next"]');
  await sleep(300);
}
async function clickNext(page) {
  const prev = await stepId(page);
  await page.click('[data-action="next-stage"], [data-action="next"]');
  try { await page.waitForFunction((p) => document.querySelector('#stage')?.dataset.stepId !== p, prev, { timeout: WAIT }); } catch { throw new Placard('撮れず：次の面に進まない'); }
}
// tutorial／predict／intro を越えて、対象の play に着く。
async function advanceTo(page, plays, target) {
  for (let guard = 0; guard < 60; guard += 1) {
    const kind = await stepKind(page);
    if (kind === 'play') {
      const curId = await stepId(page);
      const idx = plays.findIndex((p) => p.stepId === curId);
      if (idx === target) return;
      await solveAndNext(page, plays[idx]);
      await clickNext(page);
    } else if (kind === 'tutorial') {
      await page.click('[data-action="skip-tutorial"]');
      await sleep(300);
    } else if (kind === 'predict') {
      await page.click('[data-option="B"]');
      await waitFor(page, '[data-action="next"]');
      await page.click('[data-action="next"]');
      await sleep(300);
    } else if (await page.locator('[data-action="start"]').count()) {
      await page.click('[data-action="start"]');
      await sleep(300);
    } else throw new Placard(`撮れず：想定外の画面（${kind}）`);
  }
  throw new Placard('撮れず：対象の面に着かない');
}

async function sheetFrames(page, lesson, plays) {
  const frames = [];
  const shot = async (n, id, extraTitle = '') => {
    frames.push({ n, title: TITLES[n - 1], id: `${id}${extraTitle}`, png: await page.screenshot(), text: await visibleText(page) });
  };
  const { index, commands } = pickNaiveFailPlay(plays);
  const target = index === -1 ? plays.length - 1 : index;
  let step = 1;
  try {
    // 1
    await page.goto(`${page.baseUrl}/index.html?lesson=${lesson.lessonId}`);
    await waitFor(page, '[data-action="start"]');
    await sleep(1500);
    await shot(1, await stepId(page));
    // 2
    step = 2;
    await page.click('[data-action="start"]');
    await page.waitForFunction(() => ['tutorial', 'predict', 'play'].includes(document.querySelector('#stage')?.dataset.step), null, { timeout: WAIT });
    await sleep(2500);
    const kind = await stepKind(page);
    const id2 = await stepId(page);
    const cur = lesson.steps.find((s) => s.stepId === id2);
    if (kind === 'tutorial') {
      const tap = cur?.script?.[0]?.tap;
      if (['up', 'down', 'left', 'right'].includes(tap)) await page.click(`[data-command="${tap}"]`);
    } else if (kind === 'predict') await page.click('[data-option]');
    else if (kind === 'play') await page.click(`[data-command="${stringsOf(cur)[0]}"]`);
    await sleep(800);
    await shot(2, id2);
    // 3・4
    step = 3;
    await advanceTo(page, plays, target);
    const targetId = await stepId(page);
    if (index === -1) {
      frames.push({ n: 3, title: TITLES[2], placard: 'なし：素直な手で失敗する面がない' });
      frames.push({ n: 4, title: TITLES[3], placard: 'なし：素直な手で失敗する面がない' });
    } else {
      await clearAll(page);
      for (const c of commands) await page.click(`[data-command="${c}"]`);
      await page.click('[data-action="run"]');
      await waitFor(page, '[data-action="retry"], [data-action="retry-restart"]');
      await sleep(200);
      await shot(3, targetId, `。素直な手 ${runLen(commands)}`);
      await sleep(1500);
      step = 4;
      await shot(4, targetId);
      step = 5;
      const retry = page.locator('[data-action="retry"]');
      await page.click((await retry.count()) > 0 ? '[data-action="retry"]' : '[data-action="retry-restart"]');
      try { await page.waitForFunction(() => !document.querySelector('[data-transition="retry"]'), null, { timeout: WAIT }); } catch { throw new Placard('撮れず：[data-transition="retry"] が消えない'); }
    }
    // 5
    step = 5;
    await solveAndNext(page, plays[target]);
    await shot(5, targetId);
    // 6
    step = 6;
    await clickNext(page);
    await sleep(2500);
    await shot(6, await stepId(page));
  } catch (e) {
    if (!(e instanceof Placard)) throw e;
    for (let n = step; n <= 6; n += 1) if (!frames.some((f) => f.n === n)) frames.push({ n, title: TITLES[n - 1], placard: e.message });
  }
  return frames.sort((a, b) => a.n - b.n);
}

const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
async function composeSheet(browser, frames) {
  const cell = (f) => `<div class="c"><div class="h">${f.n} ${esc(f.title)}${f.id ? `（${esc(f.id)}）` : ''}</div>${
    f.png ? `<img src="data:image/png;base64,${f.png.toString('base64')}">` : `<div class="p">${esc(f.placard)}</div>`}</div>`;
  const html = `<!doctype html><meta charset="utf-8"><style>
body{margin:0;background:#f1f5f9;font-family:sans-serif;width:1280px}
.g{display:grid;grid-template-columns:624px 624px;gap:8px 16px;padding:8px}
.h{height:24px;line-height:24px;font:700 16px sans-serif;overflow:hidden;white-space:nowrap}
img,.p{width:624px;height:390px;display:block;box-sizing:border-box}
.p{background:#cbd5e1;display:flex;align-items:center;justify-content:center;font:16px sans-serif;padding:16px;text-align:center}
</style><div class="g">${frames.map(cell).join('')}</div>`;
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  await p.setContent(html);
  const png = await p.screenshot({ fullPage: true });
  await ctx.close();
  return png;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args) { console.error('使い方: node tools/playtest/sheet.mjs <lessonId> [--root <dir>] [--out <dir>]'); return 2; }
  let lesson;
  try { lesson = JSON.parse(await readFile(path.join(args.root, 'lessons', `${args.lessonId}.json`), 'utf-8')); } catch { console.error(`レッスンが読めません: ${args.lessonId}`); return 2; }
  lesson.lessonId ??= args.lessonId;
  const t0 = Date.now();
  const plays = (lesson.steps ?? []).filter((s) => s.kind === 'play');
  const server = await startServer(args.root);
  const baseUrl = `http://localhost:${server.address().port}`;
  const browser = await resolvePlaywright().chromium.launch();
  const errors = [];
  let frames;
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
    const page = await ctx.newPage();
    page.baseUrl = baseUrl;
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.addInitScript(() => { const d = new Date(); const pad = (n) => String(n).padStart(2, '0'); localStorage.setItem('steamkids.gateDate', `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`); });
    if (lesson.type !== 'grid-runtime') {
      await page.goto(`${baseUrl}/index.html?lesson=${args.lessonId}`);
      await page.waitForSelector('[data-action="start"]', { timeout: WAIT }).catch(() => {});
      await sleep(1500);
      const f1 = { n: 1, title: TITLES[0], id: await stepId(page), png: await page.screenshot(), text: await visibleText(page) };
      frames = [f1, ...TITLES.slice(1).map((title, i) => ({ n: i + 2, title, placard: `未対応の型：${lesson.type}` }))];
    } else frames = await sheetFrames(page, lesson, plays);
    await ctx.close();
    const sheet = await composeSheet(browser, frames);
    await mkdir(args.out, { recursive: true });
    await writeFile(path.join(args.out, 'sheet.png'), sheet);
    let commit = '-';
    try { commit = execSync('git rev-parse --short HEAD', { cwd: args.root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || '-'; } catch { /* 取れなければ - */ }
    const ok = frames.filter((f) => f.png).length;
    const body = frames.map((f) => `## ${f.n} ${f.title}${f.id ? `（${f.id}）` : ''}\n${f.png ? f.text : f.placard}`).join('\n');
    await writeFile(path.join(args.out, 'sheet.txt'),
      `# sheet ${args.lessonId} type=${lesson.type} commit=${commit} size=1280x800 frames=${ok}/6\n${body}\n## エラー\n${errors.length ? errors.join('\n') : 'なし'}\n`);
    console.log(`sheet: ${args.lessonId} ${ok}/6 frames ${((Date.now() - t0) / 1000).toFixed(1)}s -> ${args.out}`);
    return ok === 6 ? 0 : 1;
  } finally {
    await browser.close();
    server.close();
  }
}

process.exitCode = await main();
