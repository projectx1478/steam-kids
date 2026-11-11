// 「めいれいを よむ」試作（cmd-08-yomu。Issue #723）を通しで遊ぶ確認用スクリプト。E2E ではない（判定は人か AI が画像を見て行う）。
// 使い方: python3 -m http.server 8123 を起動し、node tools/playtest/walk-read.cjs <画像の保存先> [URL]
// 流れ: わざと外す→ためしなおす（命令列が替わる）→当てる→氷の面で素直な答えを外す→当てる→まとめ。横1280x800・縦360x640。
const { chromium } = require('playwright');
const out = process.argv[2] ?? '.';
const base = process.argv[3] ?? 'http://localhost:8123';
(async () => {
  const b = await chromium.launch();
  const run = async (name, vp) => {
    const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: 1, serviceWorkers: 'block' });
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', (e) => errs.push(String(e))); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
    await p.addInitScript(() => { const d = new Date(); const pad = (n) => String(n).padStart(2, '0'); localStorage.setItem('steamkids.gateDate', `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`); });
    await p.goto(base + '/index.html?lesson=cmd-08-yomu&dev=1');
    await p.waitForSelector('[data-action="start"]'); await p.waitForTimeout(2500);
    await p.screenshot({ path: `${out}/${name}-0-intro.png` });
    await p.click('[data-action="start"]');
    await p.waitForSelector('[data-read-board]'); await p.waitForTimeout(600);
    await p.screenshot({ path: `${out}/${name}-1-start.png` });
    const tap = (x, y) => p.click(`[data-read-board] .grid-cell[data-x="${x}"][data-y="${y}"]`, { force: true });
    console.log(name, 'run disabled before flag:', await p.isDisabled('[data-action="run"]'));
    await tap(2, 1); await p.waitForTimeout(300);          // わざと外す
    await p.screenshot({ path: `${out}/${name}-2-flag.png` });
    await p.click('[data-action="run"]'); await p.waitForSelector('[data-action="retry"]', { timeout: 15000 }); await p.waitForTimeout(900);
    await p.screenshot({ path: `${out}/${name}-3-miss.png` });
    console.log(name, 'bubble:', (await p.textContent('[data-hint="read"]')) || '');
    const before = await p.$$eval('[data-read-program] .command-chip', (els) => els.map((e) => e.dataset.dir || e.textContent.trim()).join(','));
    await p.click('[data-action="retry"]'); await p.waitForTimeout(500);
    const after = await p.$$eval('[data-read-program] .command-chip', (els) => els.map((e) => e.dataset.dir || e.textContent.trim()).join(','));
    console.log(name, 'program changed:', before !== after, '|', before, '->', after);
    await p.screenshot({ path: `${out}/${name}-4-retry.png` });
    await tap(1, 0); await p.click('[data-action="run"]');           // 2本目の正解
    await p.waitForSelector('[data-action="next-stage"]', { timeout: 20000 }); await p.waitForTimeout(300);
    await p.screenshot({ path: `${out}/${name}-5-clear.png` });
    await p.click('[data-action="next-stage"]'); await p.waitForSelector('[data-read-board]'); await p.waitForTimeout(2600);
    await tap(1, 0); await p.click('[data-action="run"]'); await p.waitForSelector('[data-action="next-stage"]', { timeout: 20000 });
    await p.click('[data-action="next-stage"]'); await p.waitForSelector('[data-read-board]'); await p.waitForTimeout(2600);
    await p.screenshot({ path: `${out}/${name}-6-ice.png` });
    await tap(1, 0); await p.click('[data-action="run"]'); await p.waitForSelector('[data-action="retry"]', { timeout: 20000 }); await p.waitForTimeout(900);  // 氷を知らない素直な答え
    await p.screenshot({ path: `${out}/${name}-7-ice-miss.png` });
    await p.click('[data-action="retry"]'); await p.waitForTimeout(400);
    await tap(2, 0); await p.click('[data-action="run"]'); await p.waitForSelector('[data-action="next"]', { timeout: 20000 });
    await p.click('[data-action="next"]'); await p.waitForTimeout(1500);
    await p.screenshot({ path: `${out}/${name}-8-summary.png` });
    console.log(name, 'errors:', JSON.stringify(errs));
    await ctx.close();
  };
  await run('land', { width: 1280, height: 800 });
  await run('port', { width: 360, height: 640 });
  await b.close();
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
