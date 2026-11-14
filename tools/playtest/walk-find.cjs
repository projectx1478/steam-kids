// 「ぜんぶ みつけよう」試作（teko-10-zenbu。Issue #722）を通しで遊ぶ確認用スクリプト。E2E ではない（判定は人か AI が画像を見て行う）。
// 使い方: python3 -m http.server 8123 を起動し、node tools/playtest/walk-find.cjs <画像の保存先> [URL]
// 流れ: 素直な手で1組→同じ置き方の繰り返し→外す→2組目（クリア）→総当たり（2組の時点で「つぎへ」が無いこと）→途中の状態→最後の面→まとめ。横1280x800・縦360x640。
const { chromium } = require('playwright');
const out = process.argv[2] ?? '.';
const base = process.argv[3] ?? 'http://localhost:8123';
(async () => {
  const b = await chromium.launch();
  const run = async (name, vp) => {
    const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: 1, serviceWorkers: 'block' });
    const p = await ctx.newPage();
    const errs = [];
    p.on('pageerror', (e) => errs.push(String(e)));
    p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
    await p.addInitScript(() => { const d = new Date(); const pad = (n) => String(n).padStart(2, '0'); localStorage.setItem('steamkids.gateDate', `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`); });
    await p.goto(base + '/index.html?lesson=teko-10-zenbu&dev=1');
    await p.waitForSelector('[data-action="start"]');
    await p.waitForTimeout(1500);
    const shot = (n) => p.screenshot({ path: `${out}/${name}-${n}.png` });
    await shot('0-intro');
    await p.click('[data-action="start"]');
    await p.waitForSelector('[data-mover]');
    await p.waitForTimeout(2500); // 「スタート！」が消えるまで
    const state = () => p.evaluate(() => ({
      found: [...document.querySelectorAll('[data-found]')].map((e) => e.dataset.found),
      slots: document.querySelectorAll('[data-found-slot]').length,
      next: !!document.querySelector('[data-action="next"], [data-action="next-stage"]'),
      retry: !!document.querySelector('[data-action="retry"]'),
      bubble: (document.querySelector('[data-sk-bird="bubble"]:not([hidden])')?.textContent ?? '').replace(/\s+/g, ' ').trim(),
    }));
    const cur = () => p.evaluate(() => { const m = document.querySelector('[data-mover]'); return { pos: Number(m.dataset.pos), robots: Number(m.dataset.robots) }; });
    const setTo = async (pos, robots) => {
      for (let i = 0; i < 12; i += 1) { const c = await cur(); if (c.pos === pos) break; await p.click(c.pos < pos ? '[data-action="pos-right"]' : '[data-action="pos-left"]'); }
      for (let i = 0; i < 8; i += 1) { const c = await cur(); if (c.robots === robots) break; await p.click(c.robots < robots ? '[data-action="robots-plus"]' : '[data-action="robots-minus"]'); }
    };
    // 置いて「ためす」。結果は found（盤が戻る前）／fail／clear のどれか。戻り値で返す。
    const tryAt = async (pos, robots, label) => {
      await setTo(pos, robots);
      await p.click('[data-action="run"]');
      await p.waitForTimeout(1350);
      let s = await state();
      if (s.found.length > 0 && s.slots === 0) { await p.waitForSelector('[data-action="next"], [data-action="next-stage"]', { timeout: 15000 }); await p.waitForTimeout(300); s = await state(); }
      if (label) await shot(label);
      const kind = s.next ? 'clear' : s.retry ? 'fail' : s.found.length ? 'found' : '?';
      console.log(name, `try ${pos}x${robots} ->`, kind, JSON.stringify(s));
      return { kind, s };
    };
    const settle = async (r) => { if (r.kind === 'found') await p.waitForTimeout(1700); else if (r.kind === 'fail') { await p.click('[data-action="retry"]'); await p.waitForTimeout(300); } };

    // ---- 1面目 find:2（左1体×4。解 4×1・2×2）
    await shot('1-start');
    let r = await tryAt(4, 1, '2-found1');          // 素直な手：1つ目
    await settle(r);
    await shot('3-after-found1-reset');
    r = await tryAt(4, 1, '4-dup');                 // 同じ置き方をもう一度
    await settle(r);
    r = await tryAt(3, 1, '5-fail');                // 外す
    await settle(r);
    await shot('6-after-fail');
    r = await tryAt(2, 2, '7-clear1');              // 2つ目でクリア
    await p.click('[data-action="next-stage"]'); await p.waitForSelector('[data-mover]'); await p.waitForTimeout(2600);
    // ---- 2面目 find:3（左2体×3 = 6）。総当たり：体数1〜3 × 目盛り1〜6 を順に試す
    await shot('8-p2-start');
    let cleared = false; let tried = 0;
    for (let robots = 1; robots <= 3 && !cleared; robots += 1) {
      for (let pos = 1; pos <= 6 && !cleared; pos += 1) {
        r = await tryAt(pos, robots, null); tried += 1;
        if (r.kind === 'found' && r.s.found.length === 2) await shot('9-p2-two-found-no-next');
        if (r.kind === 'clear') { cleared = true; await shot('10-p2-clear'); }
        else await settle(r);
      }
    }
    console.log(name, 'p2 brute-force tries until clear:', tried);
    await p.click('[data-action="next-stage"]'); await p.waitForSelector('[data-mover]'); await p.waitForTimeout(2600);
    // ---- 3面目 find:3（左4体×3 = 12。体数最大4）。途中の状態で止めて見る
    await shot('11-p3-start');
    r = await tryAt(6, 2, null); await settle(r);
    await setTo(4, 3);                               // 途中：置きかけ（まだ ためさない）
    await shot('12-p3-mid-edit-with-one-found');
    r = await tryAt(4, 3, null); await settle(r);
    r = await tryAt(3, 4, '13-p3-clear');
    await p.click('[data-action="next"]'); await p.waitForTimeout(1500);
    await shot('14-summary');
    console.log(name, 'errors:', JSON.stringify(errs));
    await ctx.close();
  };
  await run('land', { width: 1280, height: 800 });
  await run('port', { width: 360, height: 640 });
  await b.close();
})();
