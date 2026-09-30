// 移行元: .claude/verify/scenarios/p3-link-worker.mjs（ブラウザ不要）。実行: npm run test:unit
// Issue #33: workers/steam-kids-sync/src/index.js の handleLinkRedeem を、疑似D1で直接検証する。
// Workers固有APIに依存しない標準ESモジュールなのでそのままimportでき、D1（env.DB）だけインメモリ実装に差し替える。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../workers/steam-kids-sync/src/index.js';

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

const future = Date.now() + 60 * 60 * 1000;
const past = Date.now() - 60 * 1000;
const WRITE_SQL = ['UPDATE link_codes SET usedAt', 'INSERT INTO devices', 'UPDATE devices', 'UPDATE events'];
const noWrite = (calls) => calls.every((c) => !WRITE_SQL.some((w) => c.includes(w)));

test('worker /link/redeem: 新規端末はdevicesへ追加されコードが消費される', async () => {
  const env = createFakeDB({ link_codes: [{ code: 'AAAAAA', learnerId: 'LEARNER-A', expiresAt: future, usedAt: null }] });
  const r = await redeem(env, { code: 'AAAAAA', syncSecret: 'a'.repeat(32) });
  assert.equal(r.status, 200, '新規端末はredeemが200で成功する');
  assert.equal(r.body?.learnerId, 'LEARNER-A', '新規端末は発行元のlearnerIdを受け取る');
  assert.equal(env.store.devices.some((d) => d.learnerId === 'LEARNER-A'), true, '新規端末はdevicesへ追加される');
  assert.equal(env.store.link_codes[0].usedAt !== null, true, '新規端末の成功でコードが消費される');
});

test('worker /link/redeem: 乗り換え・旧IDに他端末なしなら付け替わりイベントも移管される', async () => {
  const secret = 'f'.repeat(32);
  const secretHash = await sha256Hex(secret);
  const env = createFakeDB({
    devices: [{ secretHash, learnerId: 'OLD-SOLE', createdAt: 0 }],
    events: [{ eventId: 'e1', learnerId: 'OLD-SOLE', ts: 1000 }],
    link_codes: [{ code: 'SWTCHB', learnerId: 'LEARNER-A', expiresAt: future, usedAt: null }],
  });
  const r = await redeem(env, { code: 'SWTCHB', syncSecret: secret });
  assert.equal(r.status, 200, '既に別learnerIdで同期済み(他端末なし)の端末はsecret_conflictにならず200で付け替わる');
  assert.equal(r.body?.learnerId, 'LEARNER-A', '乗り換え後、devicesのlearnerIdが発行元へ付け替わる');
  assert.equal(env.store.devices.find((d) => d.secretHash === secretHash)?.learnerId, 'LEARNER-A', '乗り換え後、devices行のlearnerIdが実際に更新されている');
  assert.equal(env.store.events.find((e) => e.eventId === 'e1')?.learnerId, 'LEARNER-A', '旧IDに他端末が無い場合、そのイベントも発行元へ移管される');
});

test('worker /link/redeem: 乗り換え・旧IDに他端末ありならdevicesだけ付け替わる', async () => {
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
  assert.equal(r.status, 200, '旧IDに他端末がある場合も200で付け替わる');
  assert.equal(env.store.devices.find((d) => d.secretHash === secretHash)?.learnerId, 'LEARNER-B', '旧IDに他端末がある場合もdevices行は付け替わる');
  assert.equal(env.store.devices.find((d) => d.secretHash === 'other-device-hash')?.learnerId, 'OLD-SHARED', '旧IDに残る他端末のdevices行は変更されない');
  assert.equal(env.store.events.find((e) => e.eventId === 'e2')?.learnerId, 'OLD-SHARED', '旧IDに他端末が残る場合、そのイベントは移管されない(他端末の履歴を失わせない)');
});

test('worker /link/redeem: 発行元と同じlearnerIdの端末が再入力しても冪等', async () => {
  const secret = 'h'.repeat(32);
  const secretHash = await sha256Hex(secret);
  const env = createFakeDB({
    devices: [{ secretHash, learnerId: 'LEARNER-C', createdAt: 0 }],
    events: [{ eventId: 'e3', learnerId: 'LEARNER-C', ts: 3000 }],
    link_codes: [{ code: 'SAMEID', learnerId: 'LEARNER-C', expiresAt: future, usedAt: null }],
  });
  const before = env.calls.length;
  const r = await redeem(env, { code: 'SAMEID', syncSecret: secret });
  assert.equal(r.status, 200, '既に発行元と同じlearnerIdの端末が再入力しても200になる(冪等)');
  assert.equal(env.store.devices.length === 1 && env.store.devices[0].learnerId === 'LEARNER-C', true, '冪等ケースでdevices行は変化しない');
  assert.equal(
    env.calls.slice(before).every((c) => !c.includes('INSERT INTO devices') && !c.includes('UPDATE devices') && !c.includes('UPDATE events')),
    true,
    '冪等ケースではdevices/eventsへの書き込みが発生しない'
  );
});

test('worker /link/redeem: 存在しないコードは404でDBを変更しない', async () => {
  const env = createFakeDB({ link_codes: [] });
  const r = await redeem(env, { code: 'NOPE01', syncSecret: 'z'.repeat(32) });
  assert.equal(r.status === 404 && r.body?.error === 'code_not_found', true, '存在しないコードは404 code_not_found');
  assert.equal(noWrite(env.calls), true, '存在しないコードではDBが変更されない');
});

test('worker /link/redeem: 期限切れコードは410でDBを変更しない', async () => {
  const env = createFakeDB({ link_codes: [{ code: 'EXPIRE', learnerId: 'LEARNER-A', expiresAt: past, usedAt: null }] });
  const r = await redeem(env, { code: 'EXPIRE', syncSecret: 'z'.repeat(32) });
  assert.equal(r.status === 410 && r.body?.error === 'code_expired', true, '期限切れコードは410 code_expired');
  assert.equal(noWrite(env.calls), true, '期限切れコードではDBが変更されない(再発行を促すのみ)');
});

test('worker /link/redeem: 使用済みコードは410でDBを変更しない', async () => {
  const env = createFakeDB({ link_codes: [{ code: 'USEDCO', learnerId: 'LEARNER-A', expiresAt: future, usedAt: Date.now() }] });
  const r = await redeem(env, { code: 'USEDCO', syncSecret: 'z'.repeat(32) });
  assert.equal(r.status === 410 && r.body?.error === 'code_already_used', true, '使用済みコードは410 code_already_used');
  assert.equal(noWrite(env.calls), true, '使用済みコードの再試行でもDBは変更されない(usedAtが二重に書き換わらない)');
});
