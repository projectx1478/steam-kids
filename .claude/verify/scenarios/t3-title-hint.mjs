// T3 タイトルの手がかり(Issue #282)。
// 「おわる」後のタイトル(=/index.html を開く)で、次に遊べる未クリアの1本があるときだけ、
// ロボットの右に押せない吹き出し「あたらしい ステージが あいたよ」を1回だけ出す。
// クリア0本・全クリア・同じレッスンの2回目は出さない。360×640・1024×600 で縦横スクロール無し・
// はじめから／つづきから 168×64 以上かつ間隔24px・吹き出しが画面内。

export const name = 'T3 タイトルの手がかり: 出し分け・押せない・2回目は出ない・360×640/1024×600で崩れない(Issue #282)';

const BUBBLE = '.title-bubble[data-role="bubble"]';
const FORBIDDEN = ['のこり', 'まだ', 'あと', 'きのうは', 'れんぞく'];

export default async function run({ page, check }) {
  const bubbleCount = async () => (await page.$$(BUBBLE)).length;
  const screen = () => page.getAttribute('#stage', 'data-screen');

  // スロット0にデータありの状態を作り、clearedLessonIds のレッスンをクリア済みにする（lastHint は消す）。
  const setup = async (clearedLessonIds) => {
    await page.goto('/index.html');
    // 開いたページの showTitle（非同期）が終わる前にデータを書くと、そのページが手がかりを先に消費して
    // lastHint を書いてしまう。タイトルの描画完了を待ってから書く。
    await page.waitForSelector('#stage[data-screen="title"]');
    await page.evaluate((ids) => {
      Object.keys(localStorage)
        .filter((k) => k.includes('lastHint'))
        .forEach((k) => localStorage.removeItem(k));
      localStorage.setItem('steamkids.profile', JSON.stringify({ learnerId: 'l-t3', label: 'たろう', createdAt: 1 }));
      localStorage.setItem('steamkids.slots', JSON.stringify({ active: 0, occupied: [true, false, false] }));
      localStorage.setItem('steamkids.events', JSON.stringify(ids.map((id, i) => (
        { eventId: `e${i}`, learnerId: 'l-t3', lessonId: id, stepId: 'p3', type: 'clear', ts: Date.now(), payload: {} }
      ))));
    }, clearedLessonIds);
  };

  // 全レッスンID（lessons/index.json の単元の lessonIds）
  await page.goto('/index.html');
  const allIds = await page.evaluate(async () => {
    const j = await (await fetch('/lessons/index.json')).json();
    const units = j.tracks ? j.tracks.flatMap((t) => t.units) : j.units;
    return units.flatMap((u) => u.lessonIds);
  });
  await check('全レッスンIDが取れる', () => allIds.length >= 2);

  // --- クリア0本: 吹き出しなし ---
  await setup([]);
  await page.goto('/index.html');
  await check('クリア0本: タイトルが表示される', screen, 'title');
  await check('クリア0本: 吹き出しなし', bubbleCount, 0);

  // --- 1本クリア: 吹き出しあり・押せない・もう一度開くとなし ---
  await setup([allIds[0]]);
  await page.goto('/index.html');
  await check('1本クリア: タイトルが表示される', screen, 'title');
  await check('1本クリア: 吹き出しが1つ', bubbleCount, 1);
  await check('吹き出しの文言', () => page.textContent(BUBBLE), 'あたらしい ステージが あいたよ');
  await check('吹き出しは aria-hidden', () => page.getAttribute(BUBBLE, 'aria-hidden'), 'true');
  await check('吹き出しは pointer-events:none', () => page.evaluate((s) => getComputedStyle(document.querySelector(s)).pointerEvents, BUBBLE), 'none');
  const stageText = await page.textContent('#stage');
  await check('禁止語（のこり・まだ・あと・きのうは・れんぞく）が画面に無い', () => FORBIDDEN.every((w) => !stageText.includes(w)));
  const bb = await page.locator(BUBBLE).boundingBox();
  await page.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2);
  await check('吹き出しをクリックしても data-screen は title のまま', screen, 'title');
  await check('クリック後も吹き出しは残る', bubbleCount, 1);

  await page.goto('/index.html');
  await check('もう一度開くと: タイトルが表示される', screen, 'title');
  await check('もう一度開くと: 吹き出しなし', bubbleCount, 0);

  // --- 全クリア: 吹き出しなし ---
  await setup(allIds);
  await page.goto('/index.html');
  await check('全クリア: タイトルが表示される', screen, 'title');
  await check('全クリア: 吹き出しなし', bubbleCount, 0);

  // --- 360×640 と 1024×600: 吹き出しありの状態でレイアウトを見る ---
  for (const [w, h] of [[360, 640], [1024, 600]]) {
    const tag = `${w}×${h}`;
    await page.setViewportSize({ width: w, height: h });
    await setup([allIds[0]]);
    await page.goto('/index.html');
    await check(`${tag}: 吹き出しが出る`, bubbleCount, 1);
    await check(`${tag}: 縦横スクロールなし`, () => page.evaluate(() => {
      const d = document.documentElement;
      const s = document.querySelector('#stage');
      return d.scrollWidth <= d.clientWidth && d.scrollHeight <= d.clientHeight
        && s.scrollWidth <= s.clientWidth && s.scrollHeight <= s.clientHeight;
    }), true);
    const nb = await page.locator('[data-action="title-new"]').boundingBox();
    const cb = await page.locator('[data-action="title-continue"]').boundingBox();
    await check(`${tag}: はじめからが168×64以上`, () => nb.width >= 168 && nb.height >= 64);
    await check(`${tag}: つづきからが168×64以上`, () => cb.width >= 168 && cb.height >= 64);
    await check(`${tag}: ボタン間隔が24px`, () => Math.abs(cb.y - (nb.y + nb.height) - 24) <= 0.5);
    const bx = await page.locator(BUBBLE).boundingBox();
    await check(`${tag}: 吹き出しが画面内`, () => bx.x >= 0 && bx.y >= 0 && bx.x + bx.width <= w && bx.y + bx.height <= h);
  }
}
