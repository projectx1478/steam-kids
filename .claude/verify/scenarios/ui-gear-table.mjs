// ヘッダ・⚙メニュー構成表の突き合わせ（Issue #574 段A）。
// docs/ui-rules.md の「ヘッダ・⚙メニュー構成表」を tools/ui-gear-table.mjs で読み、各画面で
// 「見えているヘッダ要素の id（DOM順）」「⚙の位置（表のセレクタが見える）」「⚙メニューの行の id（DOM順）」が表と同じことを確かめる。
// 期待値は isEqual（正規表現は使えない）。期待値なしの check は真偽。
// 🏠 は段Bで除去済み。段C で play の⚙の移動をしたら、docs の表を直す（このシナリオは表に従う）。

export const name = 'ヘッダ・⚙メニュー構成: docs/ui-rules.md の表と実画面が同じ(Issue #574)';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseGearTable } from '../../../tools/ui-gear-table.mjs';
import { enterTutorial, enterPlay, clearLesson } from '../helpers.mjs';

const LESSON = 'cmd-01-susumu';
const TEKO = 'teko-01-tsuriai';
const SEED = 'cmd-06-practice';

const DOCS = fileURLToPath(new URL('../../../docs/ui-rules.md', import.meta.url));
const TABLE = Object.fromEntries(parseGearTable(readFileSync(DOCS, 'utf8')).map((r) => [r.screen, r]));

// 見えているヘッダ要素の id（DOM順）。ヘッダごと隠れる画面（play・tutorial）は []。
const visibleHeader = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('#back-btn, #gear-btn')].filter((b) => b.checkVisibility()).map((b) => b.id)
  );

// 開いた⚙メニューの行（id が menu- で始まるボタン。DOM順）。#menu-zoom-open は盤が小さいときだけ出るので除く。
const visibleMenu = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('#gear-menu button[id^="menu-"]')]
      .filter((b) => b.checkVisibility() && b.id !== 'menu-zoom-open')
      .map((b) => b.id)
  );

async function compare(page, check, screen) {
  const row = TABLE[screen];
  if (!row) throw new Error(`表に ${screen} の行が無い`);
  await check(`${screen}: ヘッダ要素が表と同じ`, () => visibleHeader(page), row.header.map((s) => s.replace(/^#/, '')));
  const gear = page.locator(row.gear).first();
  await check(`${screen}: ⚙（${row.gear}）が見える`, () => gear.isVisible(), true);
  await gear.click();
  await page.waitForSelector('#gear-menu:not([hidden])');
  await check(`${screen}: ⚙メニューの行が表と同じ`, () => visibleMenu(page), row.menu.map((s) => s.replace(/^#/, '')));
  await page.click('#menu-close');
  await page.waitForSelector('#gear-menu', { state: 'hidden' });
}

const stepIs = (page, step) =>
  page.waitForFunction((s) => document.querySelector('#stage')?.dataset.step === s, step);

export default async function run({ page, check }) {
  await page.setViewportSize({ width: 360, height: 640 });

  // --- レッスン外
  await page.goto('/index.html');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/index.html');
  await page.waitForSelector('#stage[data-screen="title"]');
  await compare(page, check, 'title');

  await page.goto('/index.html?view=map');
  await page.waitForSelector('[data-lesson-id]');
  await compare(page, check, 'map');

  // --- predict（凍結fixtureの cmd-01 は intro → predict）。実JSONに替える前に見る。
  await page.goto(`/index.html?lesson=${LESSON}`);
  await page.click('[data-action="start"]');
  await stepIs(page, 'predict');
  await compare(page, check, 'predict');

  // --- 実JSON
  await page.unroute(`**/lessons/${LESSON}.json`);
  await page.goto(`/index.html?lesson=${LESSON}`);
  await page.waitForSelector('[data-action="start"]');
  await compare(page, check, 'intro');

  await enterTutorial(page);
  await compare(page, check, 'tutorial');
  await page.click('[data-action="skip-tutorial"]');
  await stepIs(page, 'play');
  await compare(page, check, 'play');

  await clearLesson(page, LESSON);
  await stepIs(page, 'summary');
  await compare(page, check, 'summary');

  await enterPlay(page, TEKO);
  await compare(page, check, 'teko');

  await page.goto(`/index.html?lesson=${SEED}`);
  await page.waitForSelector('.seed-keypad');
  await compare(page, check, 'seedPick');
}
