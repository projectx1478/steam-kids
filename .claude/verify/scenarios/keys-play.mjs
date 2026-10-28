// Issue #380: 操作画面（play）のキー操作。矢印＝命令を足す、Enter＝じっこう、Backspace＝ひとつけす。
// ①矢印でチップが増え Enter で実行が始まる ②実行中は矢印を押してもチップが増えない ③入力欄にフォーカスがあるとき矢印・Backspace は操作にならない。
// 期待値は isEqual（正規表現は使えない）。期待値なしの check は真偽。

export const name = 'キー操作(play): 矢印でチップ・Enterで実行・実行中は無視・入力欄では操作にしない(Issue #380)';
import { enterPlay } from '../helpers.mjs';

// 直前の節が保存した下書き（steamkids.draft.*）が enterPlay で復元されないよう、先に消してから入る。
async function freshPlay(page, lessonId) {
  await page.goto('/index.html');
  await page.evaluate(() => {
    for (const k of Object.keys(localStorage)) if (k.includes('draft.')) localStorage.removeItem(k);
  });
  return enterPlay(page, lessonId);
}

const chipCount = (page) => page.$$eval('.command-chip', (els) => els.length);

export default async function run({ page, check }) {
  await page.unroute('**/lessons/cmd-01-susumu.json');
  await page.setViewportSize({ width: 360, height: 640 });

  // ① ArrowUp でチップが増え、Enter で実行が始まる。
  await freshPlay(page, 'cmd-01-susumu');
  await check('キー前: チップは0個', () => chipCount(page), 0);
  await page.keyboard.press('ArrowUp');
  await check('ArrowUp でチップが1個増える', () => chipCount(page), 1);
  await page.keyboard.press('Enter');
  await check('Enter で実行が始まる（命令ボタンが無効になる）', () => page.$eval('[data-command="up"]', (b) => b.disabled), true);

  // ② 実行中に矢印を押してもチップが増えない（4個で実行を長めにする）。
  await freshPlay(page, 'cmd-01-susumu');
  for (const k of ['ArrowUp', 'ArrowUp', 'ArrowLeft', 'ArrowLeft']) await page.keyboard.press(k);
  await check('実行前: チップは4個', () => chipCount(page), 4);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector('[data-command="up"]').disabled);
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowRight');
  await check('実行中に矢印を押してもチップが増えない', () => chipCount(page), 4);

  // ③ 入力欄にフォーカスがあるとき、矢印・Backspace は操作にならない（入力欄が受ける）。
  await freshPlay(page, 'cmd-01-susumu');
  await page.evaluate(() => {
    const input = document.createElement('input');
    input.id = 'keys-test-input';
    input.type = 'text';
    document.body.appendChild(input);
  });
  await page.fill('#keys-test-input', 'ab');
  await page.focus('#keys-test-input');
  // 単行の入力欄で ArrowUp は先頭、ArrowLeft は1つ左へキャレットを動かすので、押した後に End で末尾へ戻してから Backspace する。
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('End');
  await page.keyboard.press('Backspace');
  await check('入力欄フォーカス中: 矢印でチップが増えない', () => chipCount(page), 0);
  await check('入力欄フォーカス中: Backspace は入力欄が受ける', () => page.inputValue('#keys-test-input'), 'a');
}
