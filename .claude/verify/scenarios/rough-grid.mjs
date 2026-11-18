// あばれ役（Issue #729）: grid-runtime のレッスンを乱暴に操作し、規則R1〜R10を機械で判定する（AIなし）。
// 規則・既知リストの足し方・レッスンの足し方は docs/testing-steam-kids.md「あばれ役」。
// solution は操作にだけ使い、check のラベル・.verify/rough/*.json には入れない。

import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  overflowItems, overlapPairs, smallTargets, doubleResult, boardResized,
  jumps, internalIds, filterKnown, formatFinding,
} from '../../../tools/playtest/rough-judge.mjs';

export const name = 'あばれ役: grid-runtime を乱暴に操作して機械で判定（R1〜R10。Issue #729）';

const LESSONS = ['cmd-01-susumu'];
const SIZES = [[1280, 800], [360, 640], [1024, 600]];
const RULE_NAMES = {
  R1: 'はみ出し', R2: '重なり', R3: '小さすぎ', R4: '結果が2つ同時', R5: '盤の寸法変化',
  R6: 'ワープのような飛び', R7a: 'リロード後の復帰', R7b: '戻るで外へ出る', R8: '暗幕が盤を覆う',
  R9: '隠れた操作', R10: '内部ID',
};
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ページ内：見えている要素の点検材料を集める。descは data-action/data-command/class だけ（答えを含めない）。
function collect() {
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0;
  };
  const desc = (el) => {
    const t = el.tagName.toLowerCase();
    const k = el.dataset.action ? `[data-action=${el.dataset.action}]` : el.dataset.command ? `[data-command=${el.dataset.command}]`
      : el.className && typeof el.className === 'string' ? `.${el.className.trim().split(/\s+/)[0]}` : '';
    return t + k;
  };
  const app = document.querySelector('#app') ?? document.body;
  const overflow = [];
  for (const el of app.querySelectorAll('*')) {
    if (!visible(el) || !el.childNodes.length) continue;
    if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
    overflow.push({ where: desc(el), scrollWidth: el.scrollWidth, clientWidth: el.clientWidth });
  }
  const targets = [...document.querySelectorAll('button, [data-action], [data-command]')].filter(visible);
  const rects = targets.map((el, i) => {
    const r = el.getBoundingClientRect();
    const anc = [];
    targets.forEach((o, j) => { if (j !== i && o.contains(el)) anc.push(j); });
    return { id: i, anc, where: desc(el), x: r.x, y: r.y, w: r.width, h: r.height };
  });
  const hidden = [];
  targets.forEach((el, i) => {
    const r = rects[i];
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    const off = cx < 0 || cy < 0 || cx > innerWidth || cy > innerHeight;
    const top = off ? null : document.elementFromPoint(cx, cy);
    if (off || (top && top !== el && !el.contains(top))) hidden.push({ where: r.where });
  });
  // 結果表示＝[data-result]と、トーストの[data-hint]。盤上の印（.grid-marker・盤内の未回収item）は失敗時に複数出るのが正常なので数えない。
  const results = document.querySelectorAll('[data-result], [data-hint]:not(.grid-marker):not(.grid-board *)').length;
  return { overflow, rects, hidden, results };
}

const notRelated = ([a, b]) => !a.anc.includes(b.id) && !b.anc.includes(a.id);

export default async function run({ page, check }) {
  const all = [];
  const known = JSON.parse(readFileSync(path.join(ROOT, 'tools/playtest/rough-known.json'), 'utf8'));
  let ctx = '';
  const add = (rule, where, detail) => all.push({ ...formatFinding({ rule, where: `${ctx}/${where}`, detail }) });
  const dedupe = new Set();
  const addOnce = (rule, where, detail) => {
    const key = `${rule}|${ctx}/${where}|${detail}`;
    if (!dedupe.has(key)) { dedupe.add(key); add(rule, where, detail); }
  };

  const judgeSnap = (snap, where, withSmall) => {
    for (const o of overflowItems(snap.overflow)) addOnce('R1', where, `${o.where} ${o.scrollWidth}>${o.clientWidth}`);
    for (const [a, b] of overlapPairs(snap.rects).filter(notRelated)) addOnce('R2', where, `${a.where} × ${b.where}`);
    if (doubleResult(snap.results)) addOnce('R4', where, `結果表示${snap.results}個`);
    if (withSmall) {
      for (const s of smallTargets(snap.rects)) addOnce('R3', where, `${s.where} ${Math.round(s.w)}x${Math.round(s.h)}`);
      for (const h of snap.hidden) addOnce('R9', where, h.where);
    }
  };

  // 静的な点検：3つの大きさに替えて見て、元に戻す。
  const sweep3 = async (label) => {
    for (const [w, h] of SIZES) {
      await page.setViewportSize({ width: w, height: h });
      await sleep(250);
      judgeSnap(await page.evaluate(collect), `${w}x${h}/${label}`, true);
    }
    await page.setViewportSize({ width: 1280, height: 800 });
    await sleep(250);
  };

  const stepKind = () => page.getAttribute('#stage', 'data-step');
  const startLesson = async (id) => {
    await page.goto(`/index.html?lesson=${id}`);
    await page.waitForSelector('[data-action="start"]');
  };
  const toPlay = async () => {
    await page.click('[data-action="start"]');
    await page.waitForFunction(() => ['tutorial', 'predict', 'play'].includes(document.querySelector('#stage')?.dataset.step));
    const first = await stepKind();
    if (first === 'tutorial') await page.click('[data-action="skip-tutorial"]');
    else if (first === 'predict') {
      await page.click('[data-option="B"]');
      await page.waitForSelector('[data-action="next"]', { timeout: 4000 });
      await page.click('[data-action="next"]');
    }
    await page.waitForFunction(() => document.querySelector('#stage')?.dataset.step === 'play');
  };
  const cmdsOf = (play) => (Array.isArray(play.solution) ? play.solution : play.solution?.commands ?? []).filter((c) => typeof c === 'string');
  const clickSel = (sel) => page.evaluate((s) => document.querySelector(s)?.click(), sel);
  const watch = async (ms, where) => {
    for (let t = 0; t < ms; t += 100) {
      judgeSnap(await page.evaluate(collect), where, false);
      await sleep(100);
    }
  };

  await page.unroute('**/lessons/cmd-01-susumu.json');
  await page.emulateMedia({ reducedMotion: 'no-preference' });

  for (const lessonId of LESSONS) {
    await page.goto('/index.html');
    const lesson = await page.evaluate((id) => fetch(`./lessons/${id}.json`).then((r) => r.json()), lessonId);
    const plays = lesson.steps.filter((s) => s.kind === 'play');

    // --- 通し：intro・各play・summary ---
    ctx = lessonId;
    await startLesson(lessonId);
    await sleep(500);
    for (const s of lesson.steps.filter((x) => x.kind === 'intro')) await sweep3(`${s.stepId}`);
    await toPlay();

    for (let i = 0; i < plays.length; i += 1) {
      const play = plays[i];
      const sol = cmdsOf(play);
      const hasWarps = Array.isArray(play.warps) && play.warps.length > 0;
      await page.waitForFunction((id) => document.querySelector('#stage')?.dataset.stepId === id, play.stepId);

      // 1. 開始0.5秒以内に1手だけ入れて実行。以後3秒、R1・R2・R4。
      await page.click(`[data-command="${sol[0]}"]`);
      await page.click('[data-action="run"]');
      await watch(3000, `${play.stepId}/1280x800/開始直後の実行`);

      // 2. ためしなおす → 静的な点検 → 全部入れて連打。
      await page.waitForSelector('[data-action="retry"]', { timeout: 10000 });
      await page.click('[data-action="retry"]');
      await page.waitForFunction(() => !document.querySelector('[data-transition="retry"]'), null, { timeout: 4000 });
      const clear = page.locator('[data-action="clear-all"]');
      if ((await clear.count()) > 0 && (await clear.isEnabled())) await clear.click();
      await sleep(2500);
      await sweep3(play.stepId);

      for (const c of sol) await page.click(`[data-command="${c}"]`);
      const before = await page.evaluate(() => {
        const r = document.querySelector('.grid-board')?.getBoundingClientRect();
        return r ? { w: r.width, h: r.height } : null;
      });
      const cell = await page.evaluate(() => document.querySelector('.grid-cell')?.getBoundingClientRect().width ?? 64);
      const samples = [];
      let sampling = true;
      const sampler = (async () => {
        const t0 = Date.now();
        while (sampling) {
          const p = await page.evaluate(() => {
            const r = document.querySelector('.grid-player')?.getBoundingClientRect();
            return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null;
          });
          if (p) samples.push({ t: Date.now() - t0, ...p });
          await sleep(100);
        }
      })();
      for (let n = 0; n < 5; n += 1) {
        await clickSel('[data-action="run"]');
        if (n === 2) {
          await clickSel('[data-action="menu"]');
          await sleep(100);
          await clickSel('#menu-close');
        }
        await sleep(200);
      }
      await page.waitForSelector('[data-action="next-stage"], [data-action="next"]', { timeout: 15000 });
      sampling = false;
      await sampler;
      await sleep(300);
      const after = await page.evaluate(() => {
        const r = document.querySelector('.grid-board')?.getBoundingClientRect();
        return r ? { w: r.width, h: r.height } : null;
      });
      const op = `${play.stepId}/1280x800/連打`;
      if (before && after && boardResized(before, after)) addOnce('R5', op, `${Math.round(before.w)}x${Math.round(before.h)}→${Math.round(after.w)}x${Math.round(after.h)}`);
      if (!hasWarps) for (const j of jumps(samples, cell)) addOnce('R6', op, `${j}点目で${Math.round(cell)}px以上`);

      // R8：クリア後3秒、ダイアログが盤の30%以上を覆わないか。
      for (let t = 0; t < 3000; t += 250) {
        const cover = await page.evaluate(() => {
          const b = document.querySelector('.grid-board')?.getBoundingClientRect();
          if (!b) return 0;
          let max = 0;
          for (const d of document.querySelectorAll('[role="dialog"], dialog[open]')) {
            const r = d.getBoundingClientRect();
            const cs = getComputedStyle(d);
            if (!r.width || cs.visibility === 'hidden' || cs.display === 'none') continue;
            const w = Math.min(b.right, r.right) - Math.max(b.left, r.left);
            const h = Math.min(b.bottom, r.bottom) - Math.max(b.top, r.top);
            if (w > 0 && h > 0) max = Math.max(max, (w * h) / (b.width * b.height));
          }
          return max;
        });
        if (cover >= 0.3) { addOnce('R8', `${play.stepId}/1280x800/クリア後`, `盤の${Math.round(cover * 100)}%`); break; }
        await sleep(250);
      }

      // 3. 次へ。
      await page.click('[data-action="next-stage"], [data-action="next"]');
    }
    await page.waitForFunction(() => document.querySelector('#stage')?.dataset.step === 'summary', null, { timeout: 8000 }).catch(() => {});
    await sleep(500);
    for (const s of lesson.steps.filter((x) => x.kind === 'summary')) await sweep3(`${s.stepId}`);

    // --- 戻る・リロード（最初のplayのみ。別のページ読み込み） ---
    const p0 = plays[0];
    const first2 = cmdsOf(p0).slice(0, 2);
    await startLesson(lessonId);
    await toPlay();
    for (const c of first2) await page.click(`[data-command="${c}"]`);
    await page.reload();
    await page.waitForSelector('#stage');
    await page.waitForFunction(() => document.querySelector('#stage')?.dataset.stepId || document.querySelector('[data-action="resume"]'), null, { timeout: 5000 }).catch(() => {});
    await sleep(500);
    const urlSame = new URL(page.url()).searchParams.get('lesson') === lessonId;
    const sameStep = (await page.getAttribute('#stage', 'data-step-id')) === p0.stepId;
    const resume = (await page.$('[data-action="resume"]')) !== null;
    if (!(urlSame && (sameStep || resume))) addOnce('R7a', `${p0.stepId}/1280x800/リロード`, `url=${urlSame} step=${sameStep} now=${await page.getAttribute('#stage', 'data-step-id')}/${await page.getAttribute('#stage', 'data-step')} resume=${resume}`);

    await startLesson(lessonId);
    await toPlay();
    for (const c of first2) await page.click(`[data-command="${c}"]`);
    const origin = new URL(page.url()).origin;
    await page.goBack();
    await sleep(500);
    const here = page.url();
    const alive = (await page.$('#stage')) !== null || (await page.$('[data-screen="picker"]')) !== null;
    if (!(here.startsWith(origin) && alive && !here.startsWith('about:'))) addOnce('R7b', `${p0.stepId}/1280x800/戻る`, `url=${new URL(here, origin).origin} alive=${alive}`);
  }

  // --- 保護者画面：R10 ---
  ctx = 'dashboard';
  const PASSCODE = 'testtest';
  await page.goto('/dashboard.html');
  await page.fill('#gate-setup-passcode', PASSCODE);
  await page.fill('#gate-setup-confirm', PASSCODE);
  await page.click('#gate-setup-submit');
  await sleep(1000);
  for (const id of internalIds(await page.evaluate(() => document.body.innerText))) addOnce('R10', '1280x800/保護者画面', `語:${id}`);

  // --- 結果 ---
  const unknown = filterKnown(all, known);
  const rawDir = path.join(ROOT, '.verify', 'rough');
  mkdirSync(rawDir, { recursive: true });
  for (const lessonId of [...LESSONS, 'dashboard']) {
    writeFileSync(path.join(rawDir, `${lessonId}.json`), JSON.stringify(all.filter((f) => f.where.startsWith(`${lessonId}/`)), null, 2));
  }
  for (const [rule, label] of Object.entries(RULE_NAMES)) {
    const mine = unknown.filter((f) => f.rule === rule);
    // 失敗時は未知の件（where:detail）を規則のラベルへ並べる。ハーネスの失敗出力は5行で切れるため、規則ごとに1つのcheckにまとめる。
    const list = mine.length ? `（${[...new Set(mine.map((f) => `${f.where}:${f.detail}`))].slice(0, 12).join(' / ')}）` : '';
    await check(`${rule} ${label}${list}`, async () => mine.length, 0);
  }
}
