// C6 実機フィードバック一括対応: Clean & Tactileボタン(64px)・パレットのドラッグ入力
// （snap音・spring-in・ゴースト枠）・確認ダイアログ全廃（下書き保持で代替）・
// ぜんぶ けすのreset音・指ガイドを確認する（Issue #95）。

export const name = 'C6 Tactile UI: 64pxタップ領域・ドラッグ入力・確認ダイアログ撤去・指ガイド(Issue #95)';
import { enterPlay, resetTutorialFlags } from '../helpers.mjs';

const VIEWPORTS = [
  { width: 360, height: 640 },
  { width: 1024, height: 768 },
];

async function allButtonBoxes(page) {
  const boxes = [];
  for (const el of await page.$$('button')) {
    const b = await el.boundingBox();
    if (b) boxes.push(b);
  }
  return boxes;
}

export default async function run({ page, check }) {
  // config.mjsが凍結しているcmd-01-susumuは現行構造（tutorial込み）で検証する（c2等と同じ）。
  await page.unroute('**/lessons/cmd-01-susumu.json');

  // --- 1. 子ども画面の全<button>が64px四方以上・縦スクロール無し（複数viewport） ---
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await page.goto('/index.html?lesson=cmd-01-susumu');
    await resetTutorialFlags(page);
    await page.click('[data-action="how-to"]');
    for (const dir of ['up', 'up', 'right', 'right']) await page.click(`[data-command="${dir}"]`);
    await page.click('[data-action="run"]');
    await page.waitForSelector('[data-action="continue-to-task"]', { timeout: 8000 });
    await page.click('[data-action="continue-to-task"]');
    const label = `${viewport.width}x${viewport.height}`;
    const boxes = await allButtonBoxes(page);
    await check(`${label}: 全<button>が64px四方以上`, () => boxes.length > 0 && boxes.every((b) => b.width >= 64 && b.height >= 64));
    await check(`${label}: 縦スクロール無し`, async () =>
      page.evaluate(() => document.documentElement.scrollHeight <= document.documentElement.clientHeight + 1)
    );
  }
  await page.setViewportSize({ width: 1280, height: 800 });

  // --- 2. ドラッグ・タップ・reset音・確認ダイアログ撤去・下書き復元（tutorialは1で完了済みのため
  // 前進時は自動スキップされ、intro「はじめる」からplay(p1)へ直接入る。よそうは無い。Issue #104） ---
  await page.goto('/index.html?lesson=cmd-01-susumu');
  await page.click('[data-action="start"]');
  await check('play(p1)に入る', async () => page.getAttribute('#stage', 'data-step'), 'play');

  // ドラッグ: パレットのボタンを8px以上動かして命令列上で離すと追加される（snap音・spring-in）。
  await page.evaluate(() => {
    window.__sfxLog.length = 0;
  });
  const upBox = await page.locator('[data-command="up"]').boundingBox();
  const queueBox = await page.locator('.command-queue').boundingBox();
  await page.mouse.move(upBox.x + upBox.width / 2, upBox.y + upBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(queueBox.x + queueBox.width / 2, queueBox.y + queueBox.height / 2, { steps: 10 });
  await check('ドラッグ中、命令列にゴースト枠が出る', async () => (await page.$$('.command-queue > .ghost-slot')).length, 1);
  await page.mouse.up();
  await check('ドラッグでチップが1個追加される', async () => (await page.$$('.command-chip')).length, 1);
  await check('ドラッグ後はゴースト枠が消える', async () => (await page.$$('.command-queue > .ghost-slot')).length, 0);
  await check('ドラッグ追加でsnap音が鳴る', async () => page.evaluate(() => window.__sfxLog.includes('snap')));
  await check('追加されたチップにspring-inが付く', async () => (await page.$$('.command-chip.spring-in')).length, 1);

  // ドラッグして命令列の外で離すと追加されない。
  await page.mouse.move(upBox.x + upBox.width / 2, upBox.y + upBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(upBox.x + upBox.width / 2, upBox.y - 120, { steps: 10 });
  await page.mouse.up();
  await check('命令列の外で離すと追加されない', async () => (await page.$$('.command-chip')).length, 1);

  // 8px未満の移動はタップ扱い（tap音・snap音は鳴らない）。
  await page.evaluate(() => {
    window.__sfxLog.length = 0;
  });
  await page.mouse.move(upBox.x + upBox.width / 2, upBox.y + upBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(upBox.x + upBox.width / 2 + 2, upBox.y + upBox.height / 2, { steps: 2 });
  await page.mouse.up();
  await check('8px未満の移動はタップ扱いでチップが増える', async () => (await page.$$('.command-chip')).length, 2);
  await check('タップ扱いでtap音が鳴る', async () => page.evaluate(() => window.__sfxLog.includes('tap')));
  await check('タップ扱いではsnap音が鳴らない', async () => page.evaluate(() => !window.__sfxLog.includes('snap')));

  // ぜんぶ けす → reset音（removeではない）。
  await page.evaluate(() => {
    window.__sfxLog.length = 0;
  });
  await page.click('[data-action="clear-all"]');
  await check('ぜんぶ けすでreset音が鳴る', async () => page.evaluate(() => window.__sfxLog.includes('reset')));
  await check('ぜんぶ けすでremove音は鳴らない', async () => page.evaluate(() => !window.__sfxLog.includes('remove')));
  await check('ぜんぶ けすでチップが0個になる', async () => (await page.$$('.command-chip')).length, 0);

  // 確認ダイアログは存在しない。←で戻っても命令列の下書きが復元される（Issue #95）。
  // p1から← もどるはtutorialを飛ばしてintroへ戻り（Issue #236）、はじめるで再びp1へ進める。
  await check('.confirm-dialogは存在しない', async () => (await page.$$('.confirm-dialog')).length, 0);
  for (const dir of ['up', 'up', 'left']) await page.click(`[data-command="${dir}"]`);
  await check('編集後の命令列は3個', async () => (await page.$$('.command-chip')).length, 3);
  await page.click('#back-btn');
  await check('確認なしで即座にintroへ戻る', async () => page.getAttribute('#stage', 'data-step'), 'intro');
  await page.click('[data-action="start"]');
  await check('play(p1)へ戻ると下書き(3個)が復元される', async () => (await page.$$('.command-chip')).length, 3);

  // クリアすると下書きが消え、次にp1へ入る時は空から始まる。
  await page.click('[data-action="clear-all"]');
  for (const dir of ['up', 'up', 'left', 'left']) await page.click(`[data-command="${dir}"]`);
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="next-stage"]', { timeout: 8000 });
  await page.click('#back-btn');
  await page.click('[data-action="start"]');
  await check('クリア後は下書きが残らず命令列が空で始まる', async () => (await page.$$('.command-chip')).length, 0);

  // 4で「クリア済みレッスン」を検証するため、p1を再度クリアしp2・p3まで通してレッスン全体を
  // クリアしておく（stage_clearだけでは単元スタンプ・isLessonClearedの対象にならないため。Issue #104）。
  for (const dir of ['up', 'up', 'left', 'left']) await page.click(`[data-command="${dir}"]`);
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="next-stage"]', { timeout: 8000 });
  await page.click('[data-action="next-stage"]');
  for (const dir of ['up', 'up', 'up', 'right', 'right', 'right']) await page.click(`[data-command="${dir}"]`);
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="next-stage"]', { timeout: 8000 });
  await page.click('[data-action="next-stage"]');
  for (const dir of ['up', 'up', 'right', 'right', 'right', 'right', 'up', 'up']) await page.click(`[data-command="${dir}"]`);
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="next"]', { timeout: 15000 });

  // --- 3. 未クリアレッスンのplay初回(p1)、指ガイドが出て最初の操作で消える（tutorial(group)は
  // とばす。Issue #98） ---
  await enterPlay(page, 'cmd-02-mijikaku');
  await check('未クリアplay初回(p1)で指ガイドが出る', async () => (await page.$$('.hand-hint')).length, 1);
  await page.click('[data-command="down"]');
  await check('最初の操作で指ガイドが消える', async () => (await page.$$('.hand-hint')).length, 0);

  // --- 4. クリア済みレッスンのplay(p1)では指ガイドが出ない（2でcmd-01-susumuのp1をクリア済み） ---
  await enterPlay(page, 'cmd-01-susumu');
  await check('クリア済みレッスンのplay(p1)では指ガイドが出ない', async () => (await page.$$('.hand-hint')).length, 0);

  // --- 5. reduced-motion時（既定）、指ガイドはアニメーションしない ---
  await enterPlay(page, 'cmd-02-mijikaku');
  await check('reduced-motion時、指ガイドはアニメーションしない', async () =>
    page.evaluate(() => {
      const el = document.querySelector('.hand-hint');
      return el ? getComputedStyle(el).animationName === 'none' : false;
    })
  );

  // --- 6. motion許可時は指ガイドがアニメーションする ---
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await enterPlay(page, 'cmd-02-mijikaku');
  await check('motion許可時、指ガイドはアニメーションする', async () =>
    page.evaluate(() => {
      const el = document.querySelector('.hand-hint');
      return el ? getComputedStyle(el).animationName !== 'none' : false;
    })
  );
  await page.emulateMedia({ reducedMotion: 'reduce' });

  // --- 7. チュートリアルでも指ガイドが出る ---
  await page.goto('/index.html?lesson=cmd-01-susumu');
  await resetTutorialFlags(page);
  await page.click('[data-action="how-to"]');
  await check('tutorialから始まる', async () => page.getAttribute('#stage', 'data-step'), 'tutorial');
  await check('tutorialでも指ガイドが出る', async () => (await page.$$('.hand-hint')).length, 1);
}
