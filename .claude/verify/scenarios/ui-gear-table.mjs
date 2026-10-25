// ヘッダ・⚙メニュー構成表の突き合わせ（Issue #574 段A）。
// docs/ui-rules.md の「ヘッダ・⚙メニュー構成表」を tools/ui-gear-table.mjs で読み、各画面で
// 「見えているヘッダ要素の id（DOM順）」「⚙の位置（表のセレクタが見える）」「⚙メニューの行の id（DOM順）」が表と同じことを確かめる。
// 期待値は isEqual（正規表現は使えない）。期待値なしの check は真偽。
// 🏠 は段Bで除去済み。play の⚙は段Cで吹き出し欄の右端へ移した（表のセレクタ。このシナリオは表に従う）。
// 段C: 3端末の play で全ボタン64px以上・画面内、360×640 で せってい と最寄りの命令ボタンの間16px以上。

export const name = 'ヘッダ・⚙メニュー構成: docs/ui-rules.md の表と実画面が同じ(Issue #574)';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseGearTable } from '../../../tools/ui-gear-table.mjs';
import { enterTutorial, enterPlay, clearLesson } from '../helpers.mjs';

const LESSON = 'cmd-01-susumu';
const TEKO = 'teko-01-tsuriai';
const SEED = 'cmd-06-practice';
const SIZES = [[360, 640], [844, 390], [1024, 600]];

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
  // 段C: 同じ画面に⚙が2つ出ない（teko・predict はヘッダの⚙のまま、play は欄の⚙だけ）
  await check(`${screen}: 見えている⚙は1つだけ`, () => gearCount(page), 1);
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

  // --- 段C: play の⚙は吹き出し欄の右端（3端末で 64px 以上・画面内、360×640 で最寄りの命令ボタンと16px以上）
  for (const [w, h] of SIZES) {
    const tag = `${w}×${h}`;
    await page.setViewportSize({ width: w, height: h });
    await enterPlay(page, LESSON);
    await check(`${tag} play: 欄の⚙が1つだけ（ヘッダの⚙は出ない）`, () => gearCount(page), 1);
    await check(`${tag} play: 全ボタンが64px以上・画面内`, () => buttonsOutOfSpec(page), []);
    if (w === 360) {
      await check('360×640 play: せってい と最寄りの命令ボタンの間が16px以上', () => gearGap(page), true);
      await check('360×640 play: 吹き出しの最大幅が約192px以上', () => bubbleRoom(page), true);
    }
  }
}

// 見えている⚙の数（ヘッダの #gear-btn ＋ [data-action="menu"]）。
const gearCount = (page) =>
  page.evaluate(() => [...document.querySelectorAll('#gear-btn, [data-action="menu"]')].filter((b) => b.checkVisibility()).length);

// 見えているボタンのうち、短辺 64px 未満または画面外のもの。
const buttonsOutOfSpec = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('button')]
      .filter((b) => b.checkVisibility() && b.getBoundingClientRect().width > 0)
      .filter((b) => {
        const r = b.getBoundingClientRect();
        return Math.min(r.width, r.height) < 63.5 || r.left < -0.5 || r.top < -0.5 || r.right > innerWidth + 0.5 || r.bottom > innerHeight + 0.5;
      })
      .map((b) => b.dataset.action || b.id || b.textContent.trim().slice(0, 10))
  );

// 欄の⚙と、見えている命令ボタン（うえ・した・ひだり・みぎ・とめる・1コマ・じっこう・けす）の矩形の最短距離が 16px 以上か。
const gearGap = (page) =>
  page.evaluate(() => {
    const g = document.querySelector('[data-sk-screen="bird-lane"] > [data-action="menu"]').getBoundingClientRect();
    const others = [...document.querySelectorAll('[data-command], [data-action="pause"], [data-action="step"], [data-action="run"], [data-action="clear"], [data-action="remove-last"]')].filter((b) => b.checkVisibility());
    return others.every((b) => {
      const r = b.getBoundingClientRect();
      const dx = Math.max(r.left - g.right, g.left - r.right, 0);
      const dy = Math.max(r.top - g.bottom, g.top - r.bottom, 0);
      return Math.hypot(dx, dy) >= 15.5;
    });
  });

// 欄の中で、吹き出しの置ける幅（欄の幅 − 顔64 − 間16 − ⚙64 − 吹き出しの右余白8）が 192px 以上か。
const bubbleRoom = (page) =>
  page.evaluate(() => {
    const lane = document.querySelector('[data-sk-screen="bird-lane"]').getBoundingClientRect();
    return lane.width - 64 - 16 - 64 - 8 >= 191.5;
  });
