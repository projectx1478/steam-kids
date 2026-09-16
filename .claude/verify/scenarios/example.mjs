export const name = 'サンプル: ボタンでテキストが変わる';

export default async function run({ page, check, shot }) {
  await page.goto('/.claude/verify/example/index.html');
  await check('初期テキストが表示される', async () => (await page.textContent('#label')) === '初期状態');
  await page.click('#toggle');
  await check('クリックでテキストが変わる', async () => (await page.textContent('#label')) === '変更後');
  await shot('after-click');
}
