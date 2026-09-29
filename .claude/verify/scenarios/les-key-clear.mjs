// かぎとドアの実レッスン2本がsolutionで最後までクリアできる(Issue #62)。
import { clearLesson } from '../helpers.mjs';

export const name = 'les-key: key-01・key-02がsolutionでクリアできる(Issue #62)';

export default async function run({ page, check }) {
  for (const id of ['key-01-kagi', 'key-02-iro']) {
    await clearLesson(page, id);
    await check(`${id}: まとめ画面に到達`, async () => page.evaluate(() => document.querySelector('#stage')?.dataset.step), 'summary');
  }
}
