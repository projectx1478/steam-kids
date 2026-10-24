export const name = 'C8 不正解時の操作ロック: 盤面のゆれ・tryAgain音・ためしなおす以外の無効化(Issue #106)';
import { enterPlay, clearStage, clickRetryKeep } from '../helpers.mjs';

export default async function run({ page, check }) {
  // config.mjsが凍結しているcmd-01-susumuは現行構造(3ステージ・tutorial)で検証する（c4等と同じ）。
  await page.unroute('**/lessons/cmd-01-susumu.json');
  // ゆれアニメーション自体を確認するため、既定のreduced-motionを解除する
  // （静止表示側の分岐はc4-feedback.mjsのreduced-motion既定で検証済み）。
  await page.emulateMedia({ reducedMotion: 'no-preference' });

  await enterPlay(page, 'cmd-01-susumu');
  await clearStage(page, ['up', 'up', 'left', 'left']); // p1をクリアしてp2(壁あり)へ

  await page.click('[data-command="left"]'); // start(0,3)からleftは盤外
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="retry"]', { timeout: 4000 });

  await check('不正解: 盤面がwobble-softでゆれる', async () => (await page.$$('[data-sk-screen="board"].wobble-soft')).length, 1);
  await check('不正解: tryAgain音が鳴る', () => page.evaluate(() => window.__sfxLog.includes('tryAgain')));
  await check('不正解: ゆれは自動で消える(罰則感を残さない)', async () => (await page.$$('[data-sk-screen="board"].wobble-soft')).length, 0);

  // --- ロック中: ためしなおす以外はすべて押せない ---
  await check('ロック中: 命令パレットが全てdisabled', async () => (await page.$$('[data-command]:not([disabled])')).length, 0);
  await check('ロック中: ひとつ けすがdisabled', () => page.$eval('[data-action="remove-last"]', (b) => b.disabled), true);
  await check('ロック中: ぜんぶ けすがdisabled', () => page.$eval('[data-action="clear-all"]', (b) => b.disabled), true);
  await check('ロック中: ためしなおすだけは押せる', () => page.$eval('[data-action="retry"]', (b) => b.disabled), false);
  await check(
    'ロック中: ためしなおすが強調枠で目立つ',
    () => page.$eval('[data-action="retry"]', (b) => b.classList.contains('ring-amber-300')),
    true
  );

  // チップ×を押しても命令列は変わらない（pointer-events-noneで受け付けない）
  const chipsBefore = (await page.$$('.command-chip')).length;
  await page.click('[data-remove-index="0"]', { force: true });
  await check('ロック中: チップ×は無反応', async () => (await page.$$('.command-chip')).length, chipsBefore);

  // --- ためしなおすでロック解除 ---
  await clickRetryKeep(page);
  await check('ためしなおす後: パレットが押せる', () => page.$eval('[data-command="up"]', (b) => b.disabled), false);
  await check(
    'ためしなおす後: 強調枠が消える',
    () => page.$eval('[data-action="run"]', (b) => b.classList.contains('ring-amber-300')),
    false
  );
  await page.click('[data-command="up"]');
  await check('ためしなおす後: 命令を追加できる（失敗した列は残る。#545）', async () => (await page.$$('.command-chip')).length, 2);

  // --- ためしなおす直後の約0.5秒は じっこう を受け付けない（reduced-motion でも同じ。#545-8A） ---
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.click('[data-action="run"]'); // [left, up]：left が盤外で再び失敗する
  await page.waitForSelector('[data-action="retry"]', { timeout: 4000 });
  await page.click('[data-action="retry"]');
  await check('reduced-motion: ためしなおす直後は じっこう が押せない', () => page.$eval('[data-action="run"]', (b) => b.disabled), true);
  await page.click('[data-action="run"]', { force: true }); // 連打しても再実行されない
  await check('reduced-motion: 連打しても再実行されない', async () => [(await page.$$('[data-action="run"]')).length, (await page.$$('[data-action="retry"]')).length], [1, 0]);
  await page.waitForFunction(() => document.querySelector('[data-action="run"]')?.disabled === false, null, { timeout: 3000 });
  await check('約0.5秒後は じっこう が押せる', () => page.$eval('[data-action="run"]', (b) => b.disabled), false);
}
