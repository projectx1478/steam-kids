// Issue #381: ホーム画面用のmanifest・アイコンが配信され、head に宣言があり、
// SW登録後はオフラインでもmanifestとPNGが返ること。

export const name = 'PWA: manifest・アイコンの配信とhead宣言、オフラインでも返る(Issue #381)';

const ICONS = [
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon-180.png',
  'icons/icon-maskable-512.png',
];

export default async function run({ page, check }) {
  // ① manifest の内容（run.mjs既定はSWブロックだが、通常のfetchは通る）
  await page.goto('/index.html');
  const manifest = await page.evaluate(async () => (await fetch('/manifest.webmanifest')).json());
  await check('manifest: nameとshort_nameが空でない', () => !!manifest.name && !!manifest.short_name);
  await check('manifest: start_urlが ./', () => manifest.start_url, './');
  await check('manifest: displayがbrowser', () => manifest.display, 'browser');
  await check('manifest: iconsのmaskableが1本', () => manifest.icons.filter((i) => i.purpose === 'maskable').length, 1);
  await check('manifest: iconsのpurpose anyが192・512・180の3本', () =>
    manifest.icons.filter((i) => i.purpose === 'any').map((i) => i.sizes).sort(), ['180x180', '192x192', '512x512']);
  await check('manifest: iconsが4本', () => manifest.icons.length, 4);

  // ② head の宣言
  const head = await page.evaluate(() => ({
    manifest: document.head.querySelector('link[rel="manifest"]')?.getAttribute('href'),
    apple: document.head.querySelector('link[rel="apple-touch-icon"]')?.getAttribute('href'),
    theme: document.head.querySelector('meta[name="theme-color"]')?.getAttribute('content'),
  }));
  await check('head: link rel=manifest がある', () => head.manifest, 'manifest.webmanifest');
  await check('head: link rel=apple-touch-icon がある', () => head.apple, 'icons/apple-touch-icon-180.png');
  await check('head: meta theme-color がある', () => head.theme, '#8a5a2b');

  // ③ SW登録後のオフライン配信（bgm-scenes.mjs の makeSwPage と同じ手順）
  const browser = page.context().browser();
  const origin = new URL(page.url()).origin;
  const ctx = await browser.newContext({ baseURL: origin, serviceWorkers: 'allow' });
  // register-sw.js の controllerchange 自動リロードを止める
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
  await p.goto('/index.html');
  await p.waitForFunction(() => navigator.serviceWorker?.controller, null, { timeout: 20000 });
  await p.reload();
  await p.waitForLoadState('load');
  await ctx.setOffline(true);
  const statuses = await p.evaluate(async (urls) => {
    const out = {};
    for (const u of urls) {
      try { out[u] = (await fetch('/' + u)).status; } catch { out[u] = 0; }
    }
    return out;
  }, ['manifest.webmanifest', ...ICONS]);
  for (const [u, s] of Object.entries(statuses)) {
    await check(`オフライン: ${u} が200で返る`, () => s, 200);
  }
  await ctx.close();
}
