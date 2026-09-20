// Issue #33: workers/steam-kids-sync/src/index.js の handleLinkRedeem を、疑似D1で直接検証する。
// このモジュールはWorkers固有APIに依存しない標準ESモジュール（crypto.subtle・URL・Request・Response
// のみ使用）なので、sw-routing.mjsのような疑似self方式は不要で、静的配信された本体を
// dynamic importしてそのまま呼び出せる。D1（env.DB）だけをテスト用のインメモリ実装に差し替える。

export const name = 'Worker: /link/redeem のsecret_conflict修正・コード消費・履歴移管(Issue #33)';

export default async function run({ page, check }) {
  await page.goto('/');

  const result = await page.evaluate(async () => {
    async function sha256Hex(text) {
      const bytes = new TextEncoder().encode(text);
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
    }

    // workers/steam-kids-sync/src/index.js のSQL文字列をそのまま模したインメモリD1。
    // 未知のSQLは例外にして、実装側のクエリ変更を検知する。
    function createFakeDB(seed) {
      const store = {
        devices: (seed.devices || []).map((d) => ({ ...d })),
        events: (seed.events || []).map((e) => ({ ...e })),
        link_codes: (seed.link_codes || []).map((c) => ({ ...c })),
        rate_limits: [],
      };
      const calls = [];

      function exec(sql, args) {
        calls.push(sql.replace(/\s+/g, ' ').trim());
        if (sql.includes('SELECT windowStart, count FROM rate_limits')) {
          return { first: store.rate_limits.find((r) => r.key === args[0]) || null };
        }
        if (sql.includes('INSERT INTO rate_limits')) {
          const [key, windowStart] = args;
          const idx = store.rate_limits.findIndex((r) => r.key === key);
          if (idx >= 0) store.rate_limits[idx] = { key, windowStart, count: 1 };
          else store.rate_limits.push({ key, windowStart, count: 1 });
          return { meta: { changes: 1 } };
        }
        if (sql.includes('UPDATE rate_limits SET count')) {
          const row = store.rate_limits.find((r) => r.key === args[0]);
          if (row) row.count += 1;
          return { meta: { changes: row ? 1 : 0 } };
        }
        if (sql.includes('SELECT learnerId, expiresAt, usedAt FROM link_codes')) {
          const row = store.link_codes.find((c) => c.code === args[0]);
          return { first: row ? { ...row } : null };
        }
        if (sql.includes('UPDATE link_codes SET usedAt')) {
          const [usedAt, code] = args;
          const row = store.link_codes.find((c) => c.code === code && c.usedAt === null);
          if (row) {
            row.usedAt = usedAt;
            return { meta: { changes: 1 } };
          }
          return { meta: { changes: 0 } };
        }
        if (sql.includes('SELECT learnerId FROM devices WHERE secretHash')) {
          const row = store.devices.find((d) => d.secretHash === args[0]);
          return { first: row ? { learnerId: row.learnerId } : null };
        }
        if (sql.includes('INSERT INTO devices')) {
          const [secretHash, learnerId, createdAt] = args;
          store.devices.push({ secretHash, learnerId, createdAt });
          return { meta: { changes: 1 } };
        }
        if (sql.includes('UPDATE devices SET learnerId')) {
          const [learnerId, secretHash] = args;
          const row = store.devices.find((d) => d.secretHash === secretHash);
          if (row) row.learnerId = learnerId;
          return { meta: { changes: row ? 1 : 0 } };
        }
        if (sql.includes('SELECT COUNT(*) AS n FROM devices WHERE learnerId')) {
          return { first: { n: store.devices.filter((d) => d.learnerId === args[0]).length } };
        }
        if (sql.includes('UPDATE events SET learnerId')) {
          const [newId, oldId] = args;
          let changes = 0;
          store.events.forEach((e) => {
            if (e.learnerId === oldId) {
              e.learnerId = newId;
              changes += 1;
            }
          });
          return { meta: { changes } };
        }
        throw new Error(`unhandled SQL in fake D1: ${sql}`);
      }

      const DB = {
        prepare(sql) {
          return {
            bind(...args) {
              return {
                __sql: sql,
                __args: args,
                async first() {
                  return exec(sql, args).first ?? null;
                },
                async run() {
                  return { meta: exec(sql, args).meta || { changes: 0 } };
                },
              };
            },
          };
        },
        async batch(stmts) {
          return stmts.map((s) => ({ meta: exec(s.__sql, s.__args).meta || { changes: 0 } }));
        },
      };

      return { DB, store, calls };
    }

    const mod = await import('/workers/steam-kids-sync/src/index.js');
    const worker = mod.default;
    const ORIGIN = 'https://projectx1478.github.io';
    const ENDPOINT = 'https://steam-kids-sync.projectx1478.workers.dev';

    async function redeem(env, { code, syncSecret }) {
      const request = new Request(`${ENDPOINT}/link/redeem`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
        body: JSON.stringify({ code, syncSecret }),
      });
      const res = await worker.fetch(request, env);
      let body = null;
      try {
        body = await res.json();
      } catch {
        // ボディ無しは無視
      }
      return { status: res.status, body };
    }

    const outcome = {};
    const future = Date.now() + 60 * 60 * 1000;
    const past = Date.now() - 60 * 1000;

    // 1. 新規端末の成功: devicesに新規挿入され、コードが消費される
    {
      const env = createFakeDB({
        link_codes: [{ code: 'AAAAAA', learnerId: 'LEARNER-A', expiresAt: future, usedAt: null }],
      });
      const secret = 'a'.repeat(32);
      const r = await redeem(env, { code: 'AAAAAA', syncSecret: secret });
      outcome.newDeviceStatus = r.status;
      outcome.newDeviceLearnerId = r.body?.learnerId;
      outcome.newDeviceInserted = env.store.devices.some((d) => d.learnerId === 'LEARNER-A');
      outcome.newDeviceCodeUsed = env.store.link_codes[0].usedAt !== null;
    }

    // 2. 乗り換え・旧IDに他端末なし: devicesが付け替わり、旧IDのイベントも移管される
    {
      const secret = 'f'.repeat(32);
      const secretHash = await sha256Hex(secret);
      const env = createFakeDB({
        devices: [{ secretHash, learnerId: 'OLD-SOLE', createdAt: 0 }],
        events: [{ eventId: 'e1', learnerId: 'OLD-SOLE', ts: 1000 }],
        link_codes: [{ code: 'SWTCHB', learnerId: 'LEARNER-A', expiresAt: future, usedAt: null }],
      });
      const r = await redeem(env, { code: 'SWTCHB', syncSecret: secret });
      outcome.switchSoleStatus = r.status;
      outcome.switchSoleLearnerId = r.body?.learnerId;
      outcome.switchSoleDeviceMigrated = env.store.devices.find((d) => d.secretHash === secretHash)?.learnerId;
      outcome.switchSoleEventMigrated = env.store.events.find((e) => e.eventId === 'e1')?.learnerId;
    }

    // 3. 乗り換え・旧IDに他端末あり: devicesだけ付け替わり、他端末とイベントは残る(非移管)
    {
      const secret = 'g'.repeat(32);
      const secretHash = await sha256Hex(secret);
      const env = createFakeDB({
        devices: [
          { secretHash, learnerId: 'OLD-SHARED', createdAt: 0 },
          { secretHash: 'other-device-hash', learnerId: 'OLD-SHARED', createdAt: 0 },
        ],
        events: [{ eventId: 'e2', learnerId: 'OLD-SHARED', ts: 2000 }],
        link_codes: [{ code: 'SWTCHC', learnerId: 'LEARNER-B', expiresAt: future, usedAt: null }],
      });
      const r = await redeem(env, { code: 'SWTCHC', syncSecret: secret });
      outcome.switchSharedStatus = r.status;
      outcome.switchSharedDeviceMigrated = env.store.devices.find((d) => d.secretHash === secretHash)?.learnerId;
      outcome.switchSharedOtherDeviceUntouched =
        env.store.devices.find((d) => d.secretHash === 'other-device-hash')?.learnerId;
      outcome.switchSharedEventNotMigrated = env.store.events.find((e) => e.eventId === 'e2')?.learnerId;
    }

    // 4. 冪等: 既に発行元と同じlearnerIdへ紐づく端末が再度同じコード系統で入力しても、
    //    devices/eventsへは触れずコードだけ消費される
    {
      const secret = 'h'.repeat(32);
      const secretHash = await sha256Hex(secret);
      const env = createFakeDB({
        devices: [{ secretHash, learnerId: 'LEARNER-C', createdAt: 0 }],
        events: [{ eventId: 'e3', learnerId: 'LEARNER-C', ts: 3000 }],
        link_codes: [{ code: 'SAMEID', learnerId: 'LEARNER-C', expiresAt: future, usedAt: null }],
      });
      const before = env.calls.length;
      const r = await redeem(env, { code: 'SAMEID', syncSecret: secret });
      outcome.idempotentStatus = r.status;
      outcome.idempotentDeviceUnchanged = env.store.devices.length === 1 && env.store.devices[0].learnerId === 'LEARNER-C';
      outcome.idempotentNoDeviceOrEventWrite = env.calls
        .slice(before)
        .every((c) => !c.includes('INSERT INTO devices') && !c.includes('UPDATE devices') && !c.includes('UPDATE events'));
    }

    // 5〜7. 失敗系: いずれもusedAtを変更しない(devices/eventsへの書き込みも発生しない)
    for (const [key, seedFn] of [
      ['notFound', () => ({ link_codes: [] })],
      ['expired', () => ({ link_codes: [{ code: 'EXPIRE', learnerId: 'LEARNER-A', expiresAt: past, usedAt: null }] })],
      ['alreadyUsed', () => ({ link_codes: [{ code: 'USEDCO', learnerId: 'LEARNER-A', expiresAt: future, usedAt: Date.now() }] })],
    ]) {
      const env = createFakeDB(seedFn());
      const codeToSend = key === 'notFound' ? 'NOPE01' : key === 'expired' ? 'EXPIRE' : 'USEDCO';
      const r = await redeem(env, { code: codeToSend, syncSecret: 'z'.repeat(32) });
      outcome[`${key}Status`] = r.status;
      outcome[`${key}Error`] = r.body?.error;
      outcome[`${key}NoDbWrite`] = env.calls.every(
        (c) =>
          !c.includes('UPDATE link_codes SET usedAt') &&
          !c.includes('INSERT INTO devices') &&
          !c.includes('UPDATE devices') &&
          !c.includes('UPDATE events')
      );
    }

    return outcome;
  });

  await check('新規端末はredeemが200で成功する', () => result.newDeviceStatus === 200);
  await check('新規端末は発行元のlearnerIdを受け取る', () => result.newDeviceLearnerId === 'LEARNER-A');
  await check('新規端末はdevicesへ追加される', () => result.newDeviceInserted === true);
  await check('新規端末の成功でコードが消費される', () => result.newDeviceCodeUsed === true);

  await check(
    '既に別learnerIdで同期済み(他端末なし)の端末はsecret_conflictにならず200で付け替わる',
    () => result.switchSoleStatus === 200
  );
  await check('乗り換え後、devicesのlearnerIdが発行元へ付け替わる', () => result.switchSoleLearnerId === 'LEARNER-A');
  await check('乗り換え後、devices行のlearnerIdが実際に更新されている', () => result.switchSoleDeviceMigrated === 'LEARNER-A');
  await check('旧IDに他端末が無い場合、そのイベントも発行元へ移管される', () => result.switchSoleEventMigrated === 'LEARNER-A');

  await check('旧IDに他端末がある場合も200で付け替わる', () => result.switchSharedStatus === 200);
  await check('旧IDに他端末がある場合もdevices行は付け替わる', () => result.switchSharedDeviceMigrated === 'LEARNER-B');
  await check(
    '旧IDに残る他端末のdevices行は変更されない',
    () => result.switchSharedOtherDeviceUntouched === 'OLD-SHARED'
  );
  await check(
    '旧IDに他端末が残る場合、そのイベントは移管されない(他端末の履歴を失わせない)',
    () => result.switchSharedEventNotMigrated === 'OLD-SHARED'
  );

  await check('既に発行元と同じlearnerIdの端末が再入力しても200になる(冪等)', () => result.idempotentStatus === 200);
  await check('冪等ケースでdevices行は変化しない', () => result.idempotentDeviceUnchanged === true);
  await check('冪等ケースではdevices/eventsへの書き込みが発生しない', () => result.idempotentNoDeviceOrEventWrite === true);

  await check('存在しないコードは404 code_not_found', () => result.notFoundStatus === 404 && result.notFoundError === 'code_not_found');
  await check('存在しないコードではDBが変更されない', () => result.notFoundNoDbWrite === true);

  await check('期限切れコードは410 code_expired', () => result.expiredStatus === 410 && result.expiredError === 'code_expired');
  await check('期限切れコードではDBが変更されない(再発行を促すのみ)', () => result.expiredNoDbWrite === true);

  await check(
    '使用済みコードは410 code_already_used',
    () => result.alreadyUsedStatus === 410 && result.alreadyUsedError === 'code_already_used'
  );
  await check(
    '使用済みコードの再試行でもDBは変更されない(usedAtが二重に書き換わらない)',
    () => result.alreadyUsedNoDbWrite === true
  );
}
