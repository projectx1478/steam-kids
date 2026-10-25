// G2 タップ対象は短辺64px以上（Issue #553 段1）。
// タイトル・名前入力・導入ストーリー（スキップ）・intro・tutorial・play・失敗・クリア結果・⚙メニュー・確認ダイアログ・
// まとめ・単元マップで、いま押せる button（中心が自分自身に当たるもの）の短辺が 64px 以上であることを 3 端末で見る。
// 保護者ダッシュボードは 64px の対象外（大人向け）。ただし下部のボタン（変更する・同期を始める・コードを入力）へ
// スクロールで届くこと（画面外に出たままにならない）を見る。外部APIなし。

export const name = 'G2 タップ対象は短辺64px以上（主要画面×3寸法）・ダッシュボード下部へスクロール到達(Issue #553)';
import { enterTutorial, clearStage, clickRetry, clearLesson } from '../helpers.mjs';

const LESSON = 'cmd-01-susumu';
const PASSCODE = 'testtest';
const SIZES = [[360, 640], [844, 390], [1024, 600]];

// いま画面に出ていて押せる button のうち、短辺が 64px 未満のものを「data-action/id/文言」で返す。
const smallTargets = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('button')]
      .filter((b) => {
        if (!b.checkVisibility()) return false;
        const r = b.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) return false;
        const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return top === b || b.contains(top);
      })
      .filter((b) => {
        const r = b.getBoundingClientRect();
        return Math.min(r.width, r.height) < 64 - 0.5;
      })
      .map((b) => b.dataset.action || b.id || b.textContent.trim().slice(0, 10))
  );

export default async function run({ page, check }) {
  await page.unroute(`**/lessons/${LESSON}.json`);
  const scan = (tag, label) => check(`${tag} ${label}: 押せる button の短辺が64px以上`, () => smallTargets(page), []);

  for (const [w, h] of SIZES) {
    const tag = `${w}×${h}`;
    await page.setViewportSize({ width: w, height: h });
    await page.goto('/index.html');
    await page.evaluate(() => localStorage.clear());

    // --- タイトル → 名前入力 → 導入ストーリー（スキップ） ---
    await page.goto('/index.html');
    await page.waitForSelector('#stage[data-screen="title"]');
    await scan(tag, 'タイトル');
    await page.click('[data-action="title-new"]');
    await page.click('[data-action="slot-pick"][data-slot="0"]');
    await page.fill('#name-input', 'たろう');
    await scan(tag, '名前入力');
    await page.click('[data-action="name-submit"]');
    await page.waitForSelector('[data-action="story-skip"]');
    await scan(tag, '導入ストーリー（スキップ）');
    await page.click('[data-action="story-skip"]');

    // --- intro → tutorial → play ---
    await page.waitForSelector('[data-action="start"]');
    await page.waitForSelector('[data-action="demo-replay"]');
    await scan(tag, 'intro');
    await enterTutorial(page);
    await scan(tag, 'tutorial');
    await page.click('[data-action="skip-tutorial"]');
    await page.waitForFunction(() => document.querySelector('#stage')?.dataset.step === 'play');
    await scan(tag, 'play');

    // --- クリア結果（p1）→ 失敗（p2） ---
    for (const dir of ['up', 'up', 'left', 'left']) await page.click(`[data-command="${dir}"]`);
    await page.click('[data-action="run"]');
    await page.waitForSelector('[data-action="next-stage"]', { timeout: 15000 });
    await scan(tag, 'クリア結果');
    await page.click('[data-action="next-stage"]');
    await page.waitForSelector('[data-command="left"]');
    await page.click('[data-command="left"]'); // 盤外へ出る手で失敗させる
    await page.click('[data-action="run"]');
    await page.waitForSelector('[data-action="retry"]', { timeout: 4000 });
    await scan(tag, '失敗');
    await clickRetry(page);

    // --- ⚙メニュー・確認ダイアログ ---
    await page.click('[data-action="menu"]');
    await page.waitForSelector('#gear-menu:not([hidden])');
    await scan(tag, '⚙メニュー');
    await page.click('#menu-close');

    // --- まとめ・単元マップ ---
    await clearLesson(page, LESSON);
    await page.waitForFunction(() => document.querySelector('#stage')?.dataset.step === 'summary');
    await scan(tag, 'まとめ');
    await page.goto('/index.html?view=map');
    await page.waitForSelector('[data-lesson-id]');
    await scan(tag, '単元マップ');
    // 確認ダイアログは、レッスン外（map）の⚙から開く（レッスン内のメニューにほごしゃは出ない。Issue #552）
    await page.click('#gear-btn');
    await page.waitForSelector('#gear-menu:not([hidden])');
    await page.click('#menu-guardian');
    await page.waitForSelector('.leave-confirm');
    await scan(tag, '確認ダイアログ');
    await page.click('#guardian-cancel');
  }

  // --- 保護者ダッシュボード：下部のボタンへスクロールで届く ---
  for (const [w, h] of SIZES) {
    const tag = `${w}×${h}`;
    await page.setViewportSize({ width: w, height: h });
    await page.goto('/dashboard.html');
    await page.evaluate(async (passcode) => {
      const guardian = await import('/js/guardian.js');
      await guardian.setPasscode(passcode);
    }, PASSCODE);
    await page.reload();
    await page.fill('#gate-login-passcode', PASSCODE);
    await page.click('#gate-login-submit');
    await page.waitForSelector('[data-action="passcode-change"]');
    for (const action of ['passcode-change', 'sync-register', 'sync-redeem']) {
      await page.waitForSelector(`[data-action="${action}"]`);
      await check(`${tag} ダッシュボード: ${action} へスクロールで届く（画面内に収まる）`, () =>
        page.evaluate((a) => {
          const b = document.querySelector(`[data-action="${a}"]`);
          b.scrollIntoView({ block: 'center' });
          const r = b.getBoundingClientRect();
          const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          const inView = r.top >= 0 && r.bottom <= window.innerHeight && r.left >= 0 && r.right <= window.innerWidth;
          return inView && (top === b || b.contains(top));
        }, action), true);
    }
  }
}
