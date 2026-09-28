export const name = 'cmd-03-naosu: 誤った初期命令列を消して直すとゴールに到達する(Issue #31/#104)';

export default async function run({ page, check }) {
  await page.goto('/index.html?lesson=cmd-03-naosu');
  await check('初期ステップはintro', async () => page.getAttribute('#stage', 'data-step'), 'intro');

  // よそう（predict）はIssue #104で全廃。introの「はじめる」からtutorial(fix)を経てplay(p1)へ入る
  // （Issue #98）。
  await page.click('[data-action="start"]');
  await page.click('[data-action="skip-tutorial"]');
  await check('playへ遷移', async () => page.getAttribute('#stage', 'data-step'), 'play');

  await check('p1: 初期状態で3個のチップが積まれている', async () => (await page.$$('.command-chip')).length, 3);

  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="retry"]', { timeout: 8000 });
  await check('誤った命令列のままではゴールに到達しない（もういちどが出る）', async () => (await page.$('.clear-reaction')) === null);
  await check('もういちどを押す前は編集していないため3個のまま', async () => (await page.$$('.command-chip')).length, 3);

  // 不正解後は「もういちど」以外の操作をロックする（なおす系も含め全レッスン共通。Issue #106）。
  // 直接編集はできず、もういちどを押すと初期の「ずれた」列に戻ってから直す。
  await check('不正解後: チップの取り消しはロックされる', () => page.$eval('[data-action="remove-last"]', (b) => b.disabled), true);
  await page.click('[data-action="retry"]');
  await check('もういちどで初期の「ずれた」列(3個)に戻る', async () => (await page.$$('.command-chip')).length, 3);

  await page.click('[data-remove-index="1"]');
  await check('誤った命令(2番目のdown)を消すと2個になる', async () => (await page.$$('.command-chip')).length, 2);

  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="next-stage"]', { timeout: 8000 });
  await check('直した命令列でゴールに到達する', async () => (await page.$('.clear-reaction')) !== null);
  await page.click('[data-action="next-stage"]');

  // p2（従来の単一ステージ相当。initialCommands=[right,right,up,right]、3番目のupが誤り）。
  await check('p2: 初期状態で4個のチップが積まれている', async () => (await page.$$('.command-chip')).length, 4);
  await page.click('[data-remove-index="2"]');
  await check('誤った命令(3番目のup)を消すと3個になる', async () => (await page.$$('.command-chip')).length, 3);
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="next-stage"]', { timeout: 8000 });
  await check('p2も直した命令列でゴールに到達する', async () => (await page.$('.clear-reaction')) !== null);
  await page.click('[data-action="next-stage"]');

  // p3（initialCommands 9個。7番目のupが誤り）。
  await check('p3: 初期状態で9個のチップが積まれている', async () => (await page.$$('.command-chip')).length, 9);
  await page.click('[data-remove-index="6"]');
  await check('誤った命令を消すと8個になる', async () => (await page.$$('.command-chip')).length, 8);
  await page.click('[data-action="run"]');
  await page.waitForSelector('[data-action="next"]', { timeout: 15000 });
  await check('p3も直した命令列でゴールに到達する', async () => (await page.$('.clear-reaction')) !== null);

  await page.click('[data-action="next"]');
  await check('summaryへ遷移', async () => page.getAttribute('#stage', 'data-step'), 'summary');
  await check('「ほかのレッスンへ」ボタンが表示される', async () => (await page.$('[data-action="back-to-picker"]')) !== null);
}
