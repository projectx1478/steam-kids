export const name = 'R2 れんしゅう: ばんごう入力（テンキー・おまかせ）・同じばんごうで同じ盤面・payload.seed・回数表示(Issue #69・#398)';

async function pickCode(page, digits) {
  for (const d of digits) await page.click(`[data-key="${d}"]`);
}

const slotDigits = (page) => page.$$eval('.seed-slot', (els) => els.map((e) => e.dataset.digit ?? '').join(''));
const boardDom = (page) => page.$$eval('.grid-cell', (els) => els.map((e) => e.outerHTML).join(''));
const events = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('steamkids.events') || '[]'));

// ばんごう確定後、生成盤面のsolutionをそのまま入力してクリアする。
async function clearBySolution(page, code) {
  const solution = await page.evaluate(async (c) => {
    const { generateMap } = await import('/js/engine-generate.js');
    const { codeToSeed } = await import('/js/seed-code.js');
    const step = { generator: null };
    const lesson = await (await fetch('/lessons/cmd-06-practice.json')).json();
    step.generator = lesson.steps.find((s) => s.kind === 'play').generator;
    // 新規プロフィール（クリア履歴なし）＝未解放の再現: アプリと同じく壁のみ許可
    return generateMap(step.generator, codeToSeed(c), { allowed: new Set() }).solution;
  }, code);
  for (const c of solution) await page.click(`[data-command="${c}"]`);
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="next"]', { timeout: 15000 });
  await page.click('[data-action="next"]');
}

// 入力画面のタップ対象（スロット・テンキー・スタート）の最小の幅・高さと、横スクロールの有無
const layoutOf = (page) =>
  page.evaluate(() => {
    const els = [...document.querySelectorAll('.seed-slot, .seed-key, [data-action="start"]')];
    const rects = els.map((e) => e.getBoundingClientRect());
    return {
      count: els.length,
      minW: Math.round(Math.min(...rects.map((r) => r.width))),
      minH: Math.round(Math.min(...rects.map((r) => r.height))),
      hScroll: document.documentElement.scrollWidth > window.innerWidth,
    };
  });

export default async function run({ page, check }) {
  for (const [w, h] of [[360, 640], [1024, 600]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto('/index.html?lesson=cmd-06-practice');
    await page.waitForSelector('.seed-keypad');
    const lay = await layoutOf(page);
    await check(`${w}x${h}: スロット3＋テンキー12＋スタート1が並ぶ`, async () => lay.count, 16);
    await check(`${w}x${h}: タップ対象がすべて64px以上`, async () => lay.minW >= 64 && lay.minH >= 64, true);
    await check(`${w}x${h}: 横スクロールがない`, async () => lay.hScroll, false);
  }
  await page.setViewportSize({ width: 1280, height: 800 }); // 以降は既定のPC表示に戻す
  await page.goto('/index.html?lesson=cmd-06-practice');

  await check('最初はばんごう入力画面', async () => page.getAttribute('#stage', 'data-step'), 'seedPick');
  await check('数字キー0〜9と「けす」がある', async () => (await page.$$('.seed-key[data-key]')).length, 11);
  await check('「おまかせ」がテンキー内にある', async () => (await page.$$('.seed-keypad [data-action="random-code"]')).length, 1);
  await check('3桁の入力欄がある', async () => (await page.$$('.seed-slot')).length, 3);
  await check('未入力ではスタートが押せない', () => page.$eval('[data-action="start"]', (b) => b.disabled), true);

  await pickCode(page, [0, 1]);
  await check('2つではまだスタートが押せない', () => page.$eval('[data-action="start"]', (b) => b.disabled), true);
  await pickCode(page, [2]);
  await check('3つ押すと数字キーで番号が入る', () => slotDigits(page), '012');
  await check('3つ揃うとスタートが押せる', () => page.$eval('[data-action="start"]', (b) => b.disabled), false);
  await check('入力欄をタップして選び直せる', async () => {
    await page.click('[data-slot="1"]');
    await page.click('[data-key="7"]');
    return slotDigits(page);
  }, '072');
  await check('「けす」で選んだ欄が空になりスタートが押せなくなる', async () => {
    await page.click('[data-key="del"]');
    return [await slotDigits(page), await page.$eval('[data-action="start"]', (b) => b.disabled)];
  }, ['07', true]);

  await page.click('[data-action="random-code"]');
  await check('「おまかせ」で3桁すべて埋まる', async () => (await page.$$('.seed-slot[data-digit]')).length, 3);
  await check('「おまかせ」の番号は000〜999の3桁', async () => /^\d{3}$/.test(await slotDigits(page)), true);
  await check('「おまかせ」のあとスタートが押せる', () => page.$eval('[data-action="start"]', (b) => b.disabled), false);

  await page.click('[data-slot="0"]');
  await pickCode(page, [4, 5, 6]);
  await check('4・5・6と押すと456になる', () => slotDigits(page), '456');
  await page.click('[data-action="start"]');
  await check('スタートで操作画面へ', async () => page.getAttribute('#stage', 'data-step'), 'play');
  const first = await boardDom(page);
  await check('盤面が生成される（マスが25個）', async () => (await page.$$('.grid-cell')).length, 25);

  await page.goto('/index.html?lesson=cmd-06-practice');
  await pickCode(page, [4, 5, 6]);
  await page.click('[data-action="start"]');
  await check('同じばんごうなら同じ盤面（DOM一致）', async () => (await boardDom(page)) === first);

  await clearBySolution(page, '456');
  await check('クリアでまとめへ', async () => page.getAttribute('#stage', 'data-step'), 'summary');
  await check('まとめに「ばんごう 456」の1行が出る', async () => page.textContent('.seed-number'), 'ばんごう 456');
  await check('まとめの番号にdata-seedが付く', async () => page.getAttribute('.seed-number', 'data-seed'), '456');

  const evs = (await events(page)).filter((e) => e.lessonId === 'cmd-06-practice');
  const clear = evs.find((e) => e.type === 'clear');
  await check('clearイベントのpayload.seedにばんごうが入る', async () => clear?.payload.seed, '456');
  await check('runイベントにもseedが入る', async () => evs.find((e) => e.type === 'run')?.payload.seed, '456');
  await check('lessonIdは固定', async () => new Set(evs.map((e) => e.lessonId)).size, 1);

  await page.click('[data-action="another-map"]');
  await check('「おまかせ」でばんごう入力へ戻る', async () => page.getAttribute('#stage', 'data-step'), 'seedPick');
  await check('新しいばんごうが入った状態で戻る', async () => (await page.$$('.seed-slot[data-digit]')).length, 3);

  await page.goto('/index.html?view=map');
  await check('単元マップにれんしゅうのクリア回数だけが出る', async () => page.textContent('[data-lesson-id="cmd-06-practice"] ~ .practice-count'), '1 かい');
  await check('れんしゅうにはスタンプが付かない', async () => (await page.$$('[data-lesson-id="cmd-06-practice"] ~ .lesson-stamp')).length, 0);
}
