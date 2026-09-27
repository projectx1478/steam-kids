// Issue #59: よみレベルに応じた漢字/ひらがなの出し分け、ふりがなトグルのライブ反映、
// ダッシュボードでのよみレベル設定・永続化をDOMで確認する。

export const name = 'K1 よみレベル: 漢字/ひらがな出し分け・ふりがなトグル・ダッシュボード設定(Issue #59)';

async function setReadingLevel(page, level) {
  await page.evaluate((lvl) => {
    const profile = JSON.parse(localStorage.getItem('steamkids.profile') ?? '{}');
    profile.learnerId ??= crypto.randomUUID();
    profile.readingLevel = lvl;
    localStorage.setItem('steamkids.profile', JSON.stringify(profile));
  }, level);
}

export default async function run({ page, check }) {
  // 1: よみレベル0(ねんちょう)は常にひらがな表示（cmd-02-mijikaku s1の「みち」）
  await page.goto('/index.html');
  await setReadingLevel(page, 0);
  await page.goto('/index.html?lesson=cmd-02-mijikaku');
  await check('よみレベル0ではrubyが無い', async () => (await page.$$('ruby')).length, 0);
  await check('よみレベル0ではひらがな表示', async () => page.textContent('[data-step="intro"] p'), 'おなじ みちを みじかく しよう');

  // 2: よみレベル2(2ねん)では配当学年2の「道」が漢字表示され、ふりがなON(既定)で<ruby>になる
  await setReadingLevel(page, 2);
  await page.goto('/index.html?lesson=cmd-02-mijikaku');
  await check('よみレベル2ではrubyが1個ある', async () => (await page.$$('ruby')).length, 1);
  await check('rubyの基底テキストが「道」', async () => page.textContent('ruby'), '道みち');
  await check('rtのふりがなが「みち」', async () => page.textContent('rt'), 'みち');

  // 3: ふりがなトグルはdashboard(保護者設定)へ移った（Issue #93）。OFFにして問題画面を
  // 開き直すとrtは消えるが漢字表示は維持される（S.furiganaは起動時にprofileから読む）。
  const PASSCODE = 'testtest';
  await page.goto('/dashboard.html');
  await page.fill('#gate-setup-passcode', PASSCODE);
  await page.fill('#gate-setup-confirm', PASSCODE);
  await page.click('#gate-setup-submit');
  await check('既定でふりがなトグルがON', async () => page.getAttribute('#furigana-toggle', 'aria-pressed'), 'true');
  await page.click('#furigana-toggle');
  await check('ふりがなトグルのaria-pressedがfalseになる', async () => page.getAttribute('#furigana-toggle', 'aria-pressed'), 'false');

  await page.goto('/index.html?lesson=cmd-02-mijikaku');
  await check('トグルOFFでrubyが消える', async () => (await page.$$('ruby')).length, 0);
  await check('トグルOFFでも漢字表示は維持される', async () => page.textContent('[data-step="intro"] p'), 'おなじ 道を みじかく しよう');

  // 4: 新規端末（プロファイル未作成）ではふりがなトグルの既定値がON
  await page.evaluate(() => localStorage.removeItem('steamkids.profile'));
  await page.goto('/dashboard.html');
  await page.fill('#gate-login-passcode', PASSCODE);
  await page.click('#gate-login-submit');
  await check('プロファイル未作成でも既定でふりがなトグルがON', async () => page.getAttribute('#furigana-toggle', 'aria-pressed'), 'true');

  // 5: ダッシュボードのよみレベル設定が保存され、リロード後も保持される（同期ペイロードには
  // 含まれない。sync.jsはlearnerIdとイベントしか送らないため、送信されるBearerトークンの
  // 組み立てにprofile全体が使われないことは既存p3-sync.mjs等で担保されている）。
  // 合言葉は3で設定済みなのでログインのみ行う。
  await check('よみレベルのselectが表示される', async () => (await page.$('#reading-level-select')) !== null);
  await check('既定は「ねんちょう」', async () => page.inputValue('#reading-level-select'), '0');

  await page.selectOption('#reading-level-select', '3');
  await check(
    'localStorageのprofile.readingLevelが更新される',
    async () => page.evaluate(() => JSON.parse(localStorage.getItem('steamkids.profile')).readingLevel),
    3
  );

  await page.reload();
  await page.fill('#gate-login-passcode', PASSCODE);
  await page.click('#gate-login-submit');
  await check('リロード後もよみレベルの選択が保持される', async () => page.inputValue('#reading-level-select'), '3');
}
