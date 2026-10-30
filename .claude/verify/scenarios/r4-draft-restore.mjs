// 命令列の下書き保存（Issue #556）：置いた命令は再読込・レッスン選択から入り直しても復元される。
// クリアで消え、ぜんぶけすは空を保存し、取り消しで戻すと再保存される。壊れた保存・別stepIdは黙って空で始まる。
import { routeLesson, clearStage } from '../helpers.mjs';

export const name = 'R4 命令列の下書き保存: 再読込で復元・入り直しで復元・クリアで消去・ぜんぶけす/取り消し・壊れた保存は空(Issue #556)';

const lesson = {
  lessonId: 'r4-draft',
  unitId: 'r4-draft',
  title: 'draft',
  type: 'grid-runtime',
  estimatedMinutes: 3,
  steps: [
    {
      stepId: 'p1',
      kind: 'play',
      text: 'ゴールへ いこう',
      grid: { cols: 4, rows: 4 },
      start: { x: 0, y: 0 },
      goal: { x: 2, y: 0 },
      walls: [],
      allowedCommands: ['up', 'down', 'left', 'right'],
      solution: ['right', 'right'],
      maxCommands: 6,
    },
    { stepId: 's2', kind: 'summary', text: 'おわり' },
  ],
};
const KEY = 'steamkids.draft.r4-draft';
const SOL = ['right', 'right'];

const readDraft = (page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? 'null'), KEY);
const draftLen = async (page) => (await readDraft(page))?.commands?.length ?? null;
const chips = (page) => page.$$eval('.command-chip', (els) => els.length);
const openLesson = async (page) => {
  await page.goto(`/index.html?lesson=${lesson.lessonId}`);
  await page.waitForSelector('#stage[data-step="play"]');
};
const place3 = async (page) => {
  for (const c of ['right', 'right', 'down']) await page.click(`[data-command="${c}"]`);
};

export default async function run({ page, check }) {
  await page.setViewportSize({ width: 360, height: 640 });
  await routeLesson(page, lesson);

  // --- 3個置く→再読込→3個復元 ---
  await openLesson(page);
  await check('最初は空', () => chips(page), 0);
  await place3(page);
  await check('3個置く', () => chips(page), 3);
  await check('保存は3個・stepIdとtsを持つ', async () => {
    const d = await readDraft(page);
    return [d.commands.length, d.stepId, typeof d.ts];
  }, [3, 'p1', 'number']);
  await openLesson(page);
  await check('再読込で3個復元される', () => chips(page), 3);

  // --- レッスン選択へ戻って入り直し→復元 ---
  await page.goto('/index.html');
  await page.waitForSelector('#stage');
  await openLesson(page);
  await check('レッスン選択へ戻って入り直しても3個復元される', () => chips(page), 3);
  await check('入り直し後も保存は3個のまま', () => draftLen(page), 3);

  // --- 実行中の再読込でも実行前の列が復元される ---
  await page.click('[data-action="run"]');
  await openLesson(page);
  await check('実行中の再読込でも実行前の3個が復元される', () => chips(page), 3);
  await check('実行中の再読込後も保存は3個', () => draftLen(page), 3);

  // --- 失敗→ためしなおす：失敗後も保存は残り、ためしなおすでも列は残る（#545） ---
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="retry"]', { timeout: 15000 });
  await check('失敗しても実行前の3個が保存されている', () => draftLen(page), 3);
  await page.click('[data-action="retry"]');
  await check('ためしなおすでも列の保存は3個のまま', () => draftLen(page), 3);
  await check('ためしなおすで列が残る', () => chips(page), 3);

  // --- 失敗中（ロック中）に再読込：ロックは解け、列は下書きから復元される（#545） ---
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="retry"]', { timeout: 15000 });
  await openLesson(page);
  await check('失敗中の再読込で列が3個復元される', () => chips(page), 3);
  await check('失敗中の再読込でロックが解ける（命令パレットが押せる）', () => page.$eval('[data-command="up"]', (b) => b.disabled), false);

  // --- ぜんぶけす→再読込→空 ---
  await page.click('[data-action="clear-all"]');
  await check('ぜんぶけすで空を保存する', () => draftLen(page), 0);
  await openLesson(page);
  await check('ぜんぶけす後の再読込は空', () => chips(page), 0);

  // --- ぜんぶけす連打でも空のまま・取り消し札は1枚 ---
  await place3(page);
  await page.evaluate(() => {
    for (let i = 0; i < 3; i += 1) document.querySelector('[data-action="clear-all"]')?.click();
  });
  await check('ぜんぶけす連打でも空', () => chips(page), 0);
  await check('ぜんぶけす連打でも保存は空', () => draftLen(page), 0);
  await check('取り消し札は1枚', () => page.$$eval('[data-action="undo-clear"]', (els) => els.length), 1);

  // --- ぜんぶけす→取り消し→再読込→復元 ---
  await place3(page);
  await page.click('[data-action="clear-all"]');
  await page.click('[data-action="undo-clear"]');
  await check('取り消しで戻したら再保存される', () => draftLen(page), 3);
  await openLesson(page);
  await check('取り消し後の再読込は3個復元される', () => chips(page), 3);

  // --- 壊れた保存・別stepIdは黙って空 ---
  await page.evaluate((k) => localStorage.setItem(k, '{broken'), KEY);
  await openLesson(page);
  await check('壊れた保存は空で始まる', () => chips(page), 0);
  await page.evaluate((k) => localStorage.setItem(k, JSON.stringify({ stepId: 'zzz', commands: [{ dir: 'up', times: 1 }], ts: Date.now() })), KEY);
  await openLesson(page);
  await check('stepIdが違う保存は空で始まる', () => chips(page), 0);

  // --- allowedCommands 外の dir を含む保存は破棄して空で始まる ---
  await page.evaluate((k) => localStorage.setItem(k, JSON.stringify({ stepId: 'p1', commands: [{ dir: 'jump', times: 1 }], ts: Date.now() })), KEY);
  await openLesson(page);
  await check('allowedCommands外の保存は空で始まる', () => chips(page), 0);
  await check('allowedCommands外の保存は破棄される', () => readDraft(page), null);

  // --- クリア→消去 ---
  await page.evaluate((k) => localStorage.removeItem(k), KEY);
  await openLesson(page);
  await clearStage(page, SOL);
  await check('クリアで保存が消える', () => readDraft(page), null);
  await openLesson(page);
  await check('クリア後の再読込は空', () => chips(page), 0);
}
