export const name = 'S1 セーブスロット・名前入力・導入ストーリー・上書きゲート・ダッシュボードのタブ(Issue #218)';

const PASSCODE = 'testtest';
const FIRST = 'cmd-01-susumu';

const readJSON = (page, key) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? 'null'), key);
const screen = (page) => page.getAttribute('#stage', 'data-screen');

async function startNewAt(page, slot, name) {
  await page.click('[data-action="title-new"]');
  await page.click(`[data-action="slot-pick"][data-slot="${slot}"]`);
  await page.fill('#name-input', name);
  await page.click('[data-action="name-submit"]');
}

export default async function run({ page, check }) {
  // --- はじめから＋空き枠 → 名前（タグ入り）→ ストーリー3枚 → 先頭レッスン ---
  await page.goto('/index.html');
  await check('データが無ければつづきからはdisabled', () => page.isDisabled('[data-action="title-continue"]'));
  await startNewAt(page, 0, '  <b>x</b>  ');
  await check('名前入力後はストーリー1枚目', async () => page.getAttribute('[data-story-page]', 'data-story-page'), '1');
  await page.click('[data-action="story-next"]');
  await page.click('[data-action="story-next"]');
  await check('3枚目に名前がテキストで入る(タグにならない)', async () => page.textContent('.story-text'), '<b>x</b>さん、いっしょに やってみよう！');
  await check('名前がb要素にならない', async () => (await page.$$('#stage b')).length, 0);
  await page.click('[data-action="story-next"]');
  await page.waitForSelector('[data-action="start"]');
  await check('スロットAのprofileに整形済みの名前が保存される', async () => (await readJSON(page, 'steamkids.profile')).label, '<b>x</b>');

  // スロットAにクリアを1件入れる
  await page.evaluate((lessonId) => {
    const p = JSON.parse(localStorage.getItem('steamkids.profile'));
    localStorage.setItem(
      'steamkids.events',
      JSON.stringify([{ eventId: 'e1', learnerId: p.learnerId, lessonId, stepId: 'p3', type: 'clear', ts: Date.now(), payload: {} }])
    );
  }, FIRST);

  // --- スロットB：スキップでレッスンへ・名前は空→プレイヤー2 ---
  await page.goto('/index.html');
  await startNewAt(page, 1, '');
  await page.click('[data-action="story-skip"]');
  await page.waitForSelector('[data-action="start"]');
  const slots = await readJSON(page, 'steamkids.slots');
  await check('スロットB作成後はA・Bが使用中でBがアクティブ', () => slots.occupied.join() === 'true,true,false' && slots.active === 1);
  await check('スロットBは別learnerId', async () => {
    const a = await readJSON(page, 'steamkids.profile');
    const b = await readJSON(page, 'steamkids.s2.profile');
    return a.learnerId !== b.learnerId;
  });
  await check('AのイベントがBに混ざらない', async () =>
    ((await readJSON(page, 'steamkids.s2.events')) ?? []).some((e) => e.eventId === 'e1'), false);

  // --- つづきから：スロット表示・空き枠disabled・Bはパルス強調（直接レッスンへ飛ばない） ---
  await page.goto('/index.html');
  await page.click('[data-action="title-continue"]');
  await check('スロットAの表示はクリア1', async () => page.textContent('[data-slot="0"] .slot-clears'), 'クリア 1');
  await check('スロットBは名前がプレイヤー2', async () => page.textContent('[data-slot="1"] .slot-name'), 'プレイヤー2');
  await check('空き枠はdisabled', () => page.isDisabled('[data-slot="2"]'));
  await check('最終プレイ日がM/Dで出る', async () => /^\d{1,2}\/\d{1,2}$/.test(await page.textContent('[data-slot="0"] .slot-played')));
  await page.click('[data-slot="1"]');
  await check('つづきからは単元マップへ(レッスンへ直接飛ばない)', async () => screen(page), 'picker');
  await check('Bは先頭だけにパルス', async () => page.$$eval('.next-pulse', (els) => els.map((e) => e.dataset.lessonId)), [FIRST]);
  await page.goto('/index.html?view=map');
  await check('次回起動もBがアクティブ(Aのクリアが混ざらない)', async () => page.$$eval('.lesson-stamp', (els) => els.length), 0);

  // --- 上書き：確認→保護者ゲート。やめるで何も変わらない ---
  await page.goto('/index.html');
  await page.click('[data-action="title-new"]');
  await page.click('[data-action="slot-pick"][data-slot="0"]');
  await check('上書き確認に名前入りの文が出る', async () =>
    (await page.textContent('#slot-overwrite-confirm p')).includes('<b>x</b>さんの データを けして、はじめから に しますか？'));
  await page.click('[data-action="slot-erase-cancel"]');
  await check('やめる後は確認が消える', async () => (await page.$$('#slot-overwrite-confirm')).length, 0);
  await page.click('[data-action="slot-pick"][data-slot="0"]');
  await page.click('[data-action="slot-erase"]');
  await page.waitForSelector('#parental-gate');
  const hasE1 = async () => ((await readJSON(page, 'steamkids.events')) ?? []).some((e) => e.eventId === 'e1');
  await check('けすで保護者ゲートが出る(上書きはまだ)', hasE1, true);
  await page.click('#parental-gate-cancel');
  await check('ゲートでやめるとデータは残る', hasE1, true);
  await page.click('[data-action="slot-erase"]');
  await page.fill('#parental-gate-passcode', PASSCODE);
  await page.fill('#parental-gate-confirm', PASSCODE);
  await page.click('#parental-gate-submit');
  await page.waitForSelector('#name-input');
  await check('ゲート通過でAが初期化され名前入力へ', async () => [await screen(page), await readJSON(page, 'steamkids.events')], ['name', null]);
  await check('Bには触れない', async () => (await readJSON(page, 'steamkids.s2.profile')).label, null);

  // --- ダッシュボードのタブ ---
  await page.fill('#name-input', 'あかね');
  await page.click('[data-action="name-submit"]');
  await page.click('[data-action="story-skip"]');
  await page.waitForSelector('[data-action="start"]');
  await page.goto('/dashboard.html');
  await page.fill('#gate-login-passcode', PASSCODE);
  await page.click('#gate-login-submit');
  await page.waitForSelector('#slot-tabs [data-slot-tab]');
  await check('タブは3つ・空き枠はdisabled', async () =>
    page.$$eval('#slot-tabs [data-slot-tab]', (els) => els.map((e) => e.disabled)), [false, false, true]);
  await check('タブに名前が出る', async () => page.$$eval('#slot-tabs [data-slot-tab]', (els) => els.slice(0, 2).map((e) => e.textContent)), ['あかね', 'プレイヤー2']);
  await check('呼び名入力の最大長は10', async () => page.getAttribute('#label-input', 'maxlength'), '10');
  await page.click('[data-slot-tab="1"]');
  await check('タブ切替で呼び名欄がスロットBに替わる', async () => page.inputValue('#label-input'), '');
  await page.fill('#label-input', 'かいと');
  await page.dispatchEvent('#label-input', 'change');
  await check('Bの呼び名が保存されAは変わらない', async () => [
    (await readJSON(page, 'steamkids.s2.profile')).label,
    (await readJSON(page, 'steamkids.profile')).label,
  ], ['かいと', 'あかね']);
  await check('タブ切替は次に遊ぶスロットを変えない', async () => (await readJSON(page, 'steamkids.slots')).active, 0);
}
