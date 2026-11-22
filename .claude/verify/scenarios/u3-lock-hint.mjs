// U3（Issue #742）：錠を押すと、押した錠がゆれ・先に遊ぶレッスンが枠で光り・ことりが言う。音は鳴らない。
import { readFileSync } from 'node:fs';

export const name = 'U3 錠の返事: 光る先・吹き出しの寸法・無音（Issue #742）';

function orderFromIndex() {
  const index = JSON.parse(readFileSync(new URL('../../../lessons/index.json', import.meta.url), 'utf8'));
  const ids = [];
  const walk = (o) => {
    if (Array.isArray(o)) o.forEach(walk);
    else if (o && typeof o === 'object') {
      if (o.unitId) ids.push(...o.lessonIds);
      else Object.values(o).forEach(walk);
    }
  };
  walk(index);
  return ids;
}

const setCleared = (page, ids) =>
  page.evaluate(
    (list) =>
      localStorage.setItem(
        'steamkids.events',
        JSON.stringify(
          list.map((lessonId, i) => ({ eventId: `e${i}`, learnerId: 'l', lessonId, stepId: 'p3', type: 'clear', ts: Date.now(), payload: {} }))
        )
      ),
    ids
  );

// [押す錠, 光る先]。光る先の直前までクリア済みにする。
const CASES = [
  ['cmd-03-naosu', 'cmd-01-susumu'],
  ['ice-02-kabe', 'ice-01-suberu'],
  ['teko-02-tsuriai2', 'teko-01-tsuriai'],
];

export default async function run({ page, check }) {
  await page.setViewportSize({ width: 360, height: 640 });
  const order = orderFromIndex();
  for (const [lockId, targetId] of CASES) {
    await page.goto('/index.html?view=map');
    await setCleared(page, order.slice(0, order.indexOf(targetId)));
    await page.goto('/index.html?view=map');
    await page.evaluate(() => (window.__sfxLog ? (window.__sfxLog.length = 0) : null));
    await page.click(`[data-lesson-id="${lockId}"]`, { force: true }); // 錠は aria-disabled のまま反応を返す設計（#742）。Playwright は aria-disabled を押せないと待つので force
    await check(`${lockId}: 光る先は ${targetId}（錠でなく枠クラスつき）`, () =>
      page.$eval(`[data-lesson-id="${targetId}"]`, (b) => !b.dataset.locked && b.classList.contains('ring-4')), true);
    await check(`${lockId}: 無音（__sfxLog が増えない）`, () => page.evaluate(() => (window.__sfxLog ?? []).length), 0);
    await check(`${lockId}: 吹き出しが画面内・20字以内・横スクロールなし`, () =>
      page.evaluate(() => {
        const b = document.querySelector('[data-lock-hint]');
        if (!b) return false;
        const r = b.getBoundingClientRect();
        return r.left >= 0 && r.right <= 360 && r.bottom <= 640 && [...b.textContent].length <= 20 &&
          document.documentElement.scrollWidth <= document.documentElement.clientWidth;
      }), true);
    await page.waitForTimeout(2200);
    await check(`${lockId}: 2秒後に枠が外れる`, () =>
      page.$eval(`[data-lesson-id="${targetId}"]`, (b) => b.classList.contains('ring-4')), false);
  }
}
