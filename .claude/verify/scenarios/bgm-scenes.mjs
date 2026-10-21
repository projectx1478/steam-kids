export const name = 'BGM: 4場面の切替・ミュート・SWキャッシュのみ再生・曲なし無エラー・クレジット表記（Issue #378 段2）';

import { enterPlay } from '../helpers.mjs';
import { APP_VERSION } from '../../../js/config.js';
import { silentWavBase64, DUMMY_TRACK_NAMES } from '../../../test/bgm-dummy-audio.mjs';

const PASSCODE = 'testtest';

// 保護者画面（ダッシュボード）を合言葉で開く（a1-sfx-mute と同じ手順）。
async function openDashboard(page) {
  await page.goto('/dashboard.html');
  await page.evaluate(async (passcode) => {
    const guardian = await import('/js/guardian.js');
    await guardian.setPasscode(passcode);
  }, PASSCODE);
  await page.reload();
  await page.fill('#gate-login-passcode', PASSCODE);
  await page.click('#gate-login-submit');
}

// makeSwPage: SWを許可した独自コンテキストのページを作る。run.mjs既定はSWブロックのため、
// BGM（SW登録がある環境でのみ音源を読む設計）はこちらで検証する。
// js/register-sw.js の controllerchange 自動リロードを止めてから、SWのclaimを待ち、
// 自分で1回reloadして安定状態（SW制御下からの読み込み）にする。
async function makeSwPage(browser, origin, setupRoutes) {
  const ctx = await browser.newContext({
    baseURL: origin,
    serviceWorkers: 'allow',
    viewport: { width: 1280, height: 800 },
  });
  await ctx.addInitScript(() => {
    const sw = navigator.serviceWorker;
    if (!sw) return;
    const orig = sw.addEventListener.bind(sw);
    sw.addEventListener = (type, fn, opts) => {
      if (type === 'controllerchange') return;
      orig(type, fn, opts);
    };
  });
  const p = await ctx.newPage();
  await setupRoutes(p);
  await p.goto('/index.html');
  await p.waitForFunction(() => navigator.serviceWorker?.controller, null, { timeout: 20000 });
  await p.reload();
  await p.waitForLoadState('load');
  return { ctx, p };
}

// seedDummyTracks: ダミー音源（無音WAV）をSWキャッシュへ投入する。実音源には触れない。
async function seedDummyTracks(p) {
  await p.evaluate(async ({ b64, names, cacheName }) => {
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) arr[i] = bin.charCodeAt(i);
    const cache = await caches.open(cacheName);
    for (const name of names) {
      await cache.put(`/audio/${name}.ogg`, new Response(arr.slice(0), { headers: { 'Content-Type': 'audio/ogg' } }));
    }
  }, { b64: silentWavBase64(), names: DUMMY_TRACK_NAMES, cacheName: APP_VERSION });
}

const hasLog = (p, event, detail) =>
  p.evaluate(
    ([e, d]) => window.__bgmLog.some(([ev, de]) => ev === e && (d === undefined || de === d)),
    [event, detail]
  );

export default async function run({ page, check }) {
  // ---- A. SWブロック（run.mjs既定と同条件）: BGMは音源を読まない（既存sfxシナリオへの無影響）----
  const blockedAudioReqs = [];
  page.on('request', (req) => {
    if (req.url().includes('/audio/')) blockedAudioReqs.push(req.url());
  });
  await page.goto('/index.html');
  await page.mouse.click(4, 4);
  await check('SWブロック環境では音源URLへのリクエストが無い', async () => blockedAudioReqs.length, 0);
  await check('SW未対応環境では曲なし（skipログ）で動作する', () => hasLog(page, 'skip', 'no-sw'), true);

  // 設定メニューのクレジット（子ども画面。⚙は4場面すべてから開ける）。
  await page.click('#gear-btn');
  await check('⚙メニューに「クレジット」項目がある', () => page.isVisible('#menu-credit-open'), true);
  await page.click('#menu-credit-open');
  await check('クレジット表示に「BGM: MusMus」が出る（外部リンクなし）', async () =>
    (await page.textContent('#menu-credit-view')).includes('BGM: MusMus'), true);
  await page.click('#menu-credit-close');
  await check('「とじる」でメニューが閉じる', () => page.isVisible('#gear-menu'), false);

  // 保護者画面のクレジット。
  await openDashboard(page);
  await check('保護者画面に「BGM: MusMus」の表記がある', async () =>
    (await page.textContent('body')).includes('BGM: MusMus'), true);

  // ---- B. SW許可: ダミー音源でBGMの場面切替を検証 ----
  const setupRoutes = (await import('../config.mjs')).default.setupRoutes;
  const origin = new URL(page.url()).origin;
  const browser = page.context().browser();

  const { ctx, p } = await makeSwPage(browser, origin, setupRoutes);
  const errors = [];
  p.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  p.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`);
  });

  await seedDummyTracks(p);

  // タイトル: 最初のタップで鳴り始める。
  await p.goto('/index.html');
  await p.waitForLoadState('load');
  await p.mouse.click(4, 4);
  await check('タイトル: 最初のタップで title.ogg が再生される', () => hasLog(p, 'play', 'title'), true);

  // 単元マップ: 曲が切り替わる。
  await p.goto('/index.html?view=map');
  await p.waitForLoadState('load');
  await p.mouse.click(4, 4);
  await check('単元マップ: lesson_logic.ogg に切り替わる', () => hasLog(p, 'play', 'map'), true);

  // 操作画面: 曲が切り替わる。
  await enterPlay(p, 'cmd-01-susumu');
  await check('操作画面: play_logic.ogg に切り替わる', () => hasLog(p, 'play', 'play'), true);

  // クリア: ファンファーレに重ねてクリア曲。
  for (const c of ['up', 'up', 'left', 'left']) {
    await p.click(`[data-command="${c}"]`);
  }
  await p.click('[data-action="run"]');
  await p.waitForSelector('[data-action="next-stage"]', { timeout: 8000 });
  await check('クリア: clear_logic.ogg が鳴る', () => hasLog(p, 'play', 'clear'), true);

  // ミュートで停止し、解除で再開する（steamkids.sound と連動する1スイッチ）。
  await p.evaluate(async () => {
    const sfx = await import('/js/sfx.js');
    sfx.setMuted(true);
  });
  await check('ミュートでBGMが止まる', async () =>
    p.evaluate(() => {
      const log = window.__bgmLog;
      const i = log.findIndex(([e, d]) => e === 'pause' && d === 'mute');
      return i >= 0 && !log.slice(i).some(([e]) => e === 'resume');
    }), true);
  await p.evaluate(async () => {
    const sfx = await import('/js/sfx.js');
    sfx.setMuted(false);
  });
  await check('ミュート解除でBGMが再開する', async () =>
    p.evaluate(() => {
      const log = window.__bgmLog;
      const i = log.findIndex(([e, d]) => e === 'pause' && d === 'mute');
      return i >= 0 && log.slice(i).some(([e]) => e === 'resume');
    }), true);

  // 再読込後もミュートが保持される。
  await p.evaluate(() => localStorage.setItem('steamkids.sound', 'off'));
  await p.reload();
  await p.waitForLoadState('load');
  await p.mouse.click(4, 4);
  await check('再読込後もミュートが保持される（曲は鳴らない）', () => hasLog(p, 'skip', 'muted'), true);
  await p.evaluate(() => localStorage.setItem('steamkids.sound', 'on'));

  // Service Worker のキャッシュのみで再生（外部へ音源リクエストを出さない）。
  // page.route はSW経由の取得を横取りするため、オフラインにしてキャッシュ命中だけで鳴ることを確かめる。
  const audioNotFromSw = [];
  p.on('response', (res) => {
    if (res.url().includes('/audio/') && !res.fromServiceWorker()) audioNotFromSw.push(res.url());
  });
  await ctx.setOffline(true);
  await p.reload();
  await p.waitForLoadState('load');
  await p.mouse.click(4, 4);
  // 再読込は直前の操作画面から再開するため、鳴る曲は play 場面の曲になる。
  await p.waitForFunction(() => window.__bgmLog.some(([e, d]) => e === 'play' && d === 'play'), null, { timeout: 5000 });
  await check('SWキャッシュのみで再生できる', () => hasLog(p, 'play', 'play'), true);
  await check('再生で外部へ音源リクエストを出さない', async () => audioNotFromSw, []);
  await ctx.setOffline(false);

  // 検証中の pageerror・console.error が無いこと（曲なしシナリオを除く）。
  await check('SW環境で pageerror・console.error が無い', async () => errors, []);

  await ctx.close();

  // ---- C. 曲なし環境（SW許可・未投入）: 無音のままエラーなし ----
  const { ctx: ctx2, p: p2 } = await makeSwPage(browser, origin, setupRoutes);
  const errors2 = [];
  p2.on('pageerror', (e) => errors2.push(`pageerror: ${e.message}`));
  p2.on('console', (m) => {
    // 曲なしの404は、ブラウザ自身が「Failed to load resource」として記録する（アプリのエラーではない）。
    if (m.type() === 'error' && !m.location().url.includes('/audio/')) errors2.push(`console.error: ${m.text()}`);
  });
  await p2.goto('/index.html');
  await p2.waitForLoadState('load');
  await p2.mouse.click(4, 4);
  await check('曲なし環境では error ログだけで静かに無音のまま', () =>
    p2.evaluate(() => window.__bgmLog.some(([e]) => e === 'error')), true);
  await check('曲なし環境で pageerror・console.error が無い', async () => errors2, []);
  await ctx2.close();
}
