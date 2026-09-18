export const name = 'P3: mergeEvents純粋関数';

export default async function run({ page, check }) {
  await page.goto('/index.html');

  const dedup = await page.evaluate(async () => {
    const { mergeEvents } = await import('/js/merge.js');
    const local = [
      { eventId: 'a', ts: 1 },
      { eventId: 'b', ts: 2 },
    ];
    const incoming = [
      { eventId: 'b', ts: 2 },
      { eventId: 'c', ts: 3 },
    ];
    return mergeEvents(local, incoming).map((e) => e.eventId);
  });
  await check('eventIdで重複排除される', async () => JSON.stringify(dedup), JSON.stringify(['a', 'b', 'c']));

  const sorted = await page.evaluate(async () => {
    const { mergeEvents } = await import('/js/merge.js');
    const local = [{ eventId: 'a', ts: 30 }];
    const incoming = [
      { eventId: 'b', ts: 10 },
      { eventId: 'c', ts: 20 },
    ];
    return mergeEvents(local, incoming).map((e) => e.eventId);
  });
  await check('ts昇順に並ぶ', async () => JSON.stringify(sorted), JSON.stringify(['b', 'c', 'a']));

  const capped = await page.evaluate(async () => {
    const { mergeEvents } = await import('/js/merge.js');
    const local = Array.from({ length: 5000 }, (_, i) => ({ eventId: `l${i}`, ts: i }));
    const incoming = [{ eventId: 'new', ts: 5000 }];
    return mergeEvents(local, incoming, 5000);
  });
  await check('5000件を超えたら古い順に破棄され件数は上限に収まる', async () => capped.length, 5000);
  await check('最古(l0)が破棄されている', async () => capped[0].eventId, 'l1');
  await check('末尾は最新のnew', async () => capped[capped.length - 1].eventId, 'new');

  const empty = await page.evaluate(async () => {
    const { mergeEvents } = await import('/js/merge.js');
    return mergeEvents([], []);
  });
  await check('空配列同士は空配列を返す', async () => empty.length, 0);

  const missingTs = await page.evaluate(async () => {
    const { mergeEvents } = await import('/js/merge.js');
    const local = [{ eventId: 'a' }];
    const incoming = [{ eventId: 'b', ts: 5 }];
    return mergeEvents(local, incoming).map((e) => e.eventId);
  });
  await check(
    'ts欠損要素でも例外を投げず処理される',
    async () => JSON.stringify(missingTs),
    JSON.stringify(['a', 'b'])
  );
}
