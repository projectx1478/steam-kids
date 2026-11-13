// 「めいれいを よむ」試作（cmd-08-yomu。Issue #723）を通しで遊ぶ確認用スクリプト。E2E ではない（判定は人か AI が画像を見て行う）。
// 使い方: python3 -m http.server 8123 を起動し、node tools/playtest/walk-read.cjs <画像の保存先> [URL]
// 流れ: 読み違えた道をなぞって外す→ためしなおす（命令列が替わる）→タップで当てる→道を正しくなぞる→氷の面で素直な道を外す→当てる→まとめ。横1280x800・縦360x640。
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
    const center = async (x, y) => { const r = await p.locator(`[data-read-board] .grid-cell[data-x="${x}"][data-y="${y}"]`).boundingBox(); return [r.x + r.width / 2, r.y + r.height / 2]; };
    const tap = async (x, y) => { const [cx, cy] = await center(x, y); await p.mouse.click(cx, cy); };
    // ロボットのマスから、マスの列を指でなぞる
    const trace = async (cells) => { let [cx, cy] = await center(...cells[0]); await p.mouse.move(cx, cy); await p.mouse.down(); for (const c of cells.slice(1)) { [cx, cy] = await center(...c); await p.mouse.move(cx, cy, { steps: 6 }); } await p.mouse.up(); };
    const program = () => p.$$eval('[data-read-program] .command-chip', (els) => els.map((e) => e.textContent.replace(/[0-9\s]/g, '')).join(','));
    const shot = (n) => p.screenshot({ path: `${out}/${name}-${n}.png` });
    console.log(name, 'run disabled before flag:', await p.isDisabled('[data-action="run"]'));
    // 1面目：命令は「うえ・みぎ・みぎ・みぎ」。みぎ・みぎ・うえ と読み違えた道をなぞる（外れ・道が分かれる）
    await p.click('[data-read-program] .command-chip[data-index="1"]'); // 「ここまで よんだ」の印
    await trace([[0, 2], [1, 2], [2, 2], [2, 1]]); await p.waitForTimeout(300);
    await shot('2-traced');
    await p.click('[data-action="run"]'); await p.waitForSelector('[data-action="retry"]', { timeout: 15000 }); await p.waitForTimeout(900);
    await shot('3-fork');
    console.log(name, 'bubble:', ((await p.textContent('[data-hint="read"]')) || '').replace(/\s+/g, ' ').trim(), '| fork chip:', await p.$$eval('.rd-chip-fork', (els) => els.map((e) => e.dataset.index).join(',')));
    const before = await program();
    await p.click('[data-action="retry"]'); await p.waitForTimeout(500);
    const after = await program();
    console.log(name, 'program changed:', before !== after, '|', before, '->', after);
    await tap(2, 1); await p.waitForTimeout(200);                      // タップで旗だけ置く（外れの位置）
    await p.click('[data-action="flag-stand"]'); await p.waitForTimeout(200);   // はた立てへ戻す
    console.log(name, 'run disabled after stand:', await p.isDisabled('[data-action="run"]'));
    await tap(1, 0); await p.click('[data-action="run"]');             // 2本目（みぎ・うえ・うえ）の正解
    await p.waitForSelector('[data-action="next-stage"]', { timeout: 20000 });
    await p.click('[data-action="next-stage"]'); await p.waitForSelector('[data-read-board]'); await p.waitForTimeout(2600);
    // 2面目：道を最後まで正しくなぞる（道もぴったり）
    await trace([[0, 3], [1, 3], [2, 3], [2, 2], [2, 1], [1, 1], [1, 0]]); await p.waitForTimeout(200);
    await p.click('[data-action="run"]'); await p.waitForSelector('[data-action="next-stage"]', { timeout: 20000 }); await p.waitForTimeout(200);
    await shot('5-exact');
    console.log(name, 'exact label:', await p.evaluate(() => document.body.innerText.includes('みちも ぴったり')));
    await p.click('[data-action="next-stage"]'); await p.waitForSelector('[data-read-board]'); await p.waitForTimeout(2600);
    // 3面目（氷）：氷を知らない素直な道をなぞる（うえ・みぎ・うえ・うえ を1マスずつ）
    await trace([[0, 3], [0, 2], [1, 2], [1, 1], [1, 0]]); await p.waitForTimeout(200);
    await p.click('[data-action="run"]'); await p.waitForSelector('[data-action="retry"]', { timeout: 20000 }); await p.waitForTimeout(900);
    await shot('7-ice-fork');
    await p.click('[data-action="retry"]'); await p.waitForTimeout(400);
    await tap(2, 0); await p.click('[data-action="run"]'); await p.waitForSelector('[data-action="next"]', { timeout: 20000 });
    await p.click('[data-action="next"]'); await p.waitForTimeout(1500);
    await shot('8-summary');
    console.log(name, 'errors:', JSON.stringify(errs));
    await ctx.close();
  };
  await run('land', { width: 1280, height: 800 });
  await run('port', { width: 360, height: 640 });
  await b.close();
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
