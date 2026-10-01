// 移行元: .claude/verify/scenarios/guardian-worker.mjs（ブラウザ不要）。実行: npm run test:unit
// Issue #38: workers/steam-kids-sync/src/index.js の /guardian/set・/guardian/auth・/guardian/change・
// /link/issueのトークンガードを、疑似D1で直接検証する（worker-link.test.mjsと同方式）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../workers/steam-kids-sync/src/index.js';

async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function bytesToBase64Url(bytes) {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// ワーカー側と同一のHMAC-SHA256実装。exp操作済みトークンをテストのために自作するため必要
// （/guardian/authは常にTTL6時間先のトークンしか発行できず、期限切れを直接得られない）。
async function hmacSignHex(keyHex, message) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(keyHex),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return bytesToBase64Url(new Uint8Array(sig));
}

async function makeToken(learnerId, passHash, exp) {
  const payloadB64 = bytesToBase64Url(new TextEncoder().encode(JSON.stringify({ learnerId, exp })));
  const sig = await hmacSignHex(passHash, payloadB64);
  return `${payloadB64}.${sig}`;
}

// workers/steam-kids-sync/src/index.js のSQL文字列をそのまま模したインメモリD1。
function createFakeDB(seed) {
  const store = {
    devices: (seed.devices || []).map((d) => ({ ...d })),
    guardians: (seed.guardians || []).map((g) => ({ ...g })),
    link_codes: [],
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
    if (sql.includes('SELECT learnerId FROM devices WHERE secretHash')) {
      const row = store.devices.find((d) => d.secretHash === args[0]);
      return { first: row ? { learnerId: row.learnerId } : null };
    }
    if (sql.includes('SELECT learnerId FROM guardians WHERE learnerId')) {
      const row = store.guardians.find((g) => g.learnerId === args[0]);
      return { first: row ? { learnerId: row.learnerId } : null };
    }
    if (sql.includes('SELECT passHash FROM guardians WHERE learnerId')) {
      const row = store.guardians.find((g) => g.learnerId === args[0]);
      return { first: row ? { passHash: row.passHash } : null };
    }
    if (sql.includes('INSERT INTO guardians')) {
      const [learnerId, passHash, updatedAt] = args;
      store.guardians.push({ learnerId, passHash, updatedAt });
      return { meta: { changes: 1 } };
    }
    if (sql.includes('UPDATE guardians SET passHash')) {
      const [passHash, updatedAt, learnerId] = args;
      const row = store.guardians.find((g) => g.learnerId === learnerId);
      if (row) {
        row.passHash = passHash;
        row.updatedAt = updatedAt;
      }
      return { meta: { changes: row ? 1 : 0 } };
    }
    if (sql.includes('SELECT code FROM link_codes WHERE code')) {
      return { first: store.link_codes.find((c) => c.code === args[0]) || null };
    }
    if (sql.includes('INSERT INTO link_codes')) {
      const [code, learnerId, expiresAt] = args;
      store.link_codes.push({ code, learnerId, expiresAt, usedAt: null });
      return { meta: { changes: 1 } };
    }
    throw new Error(`unhandled SQL in fake D1: ${sql}`);
  }

  const DB = {
    prepare(sql) {
      return {
        bind(...args) {
          return {
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
const LEARNER = 'aaaaaaaa-1111-1111-1111-111111111111';
const DEVICE_SECRET = 'd'.repeat(32);

test('worker 保護者トークン: set/auth/レート制限/link/issue/change の一連の挙動(Issue #38)', async () => {
  const deviceSecretHash = await sha256Hex(DEVICE_SECRET);
  const env = createFakeDB({ devices: [{ secretHash: deviceSecretHash, learnerId: LEARNER, createdAt: 0 }] });

  async function call(path, { body, token, ip } = {}) {
    const headers = { 'Content-Type': 'application/json', Origin: ORIGIN, Authorization: `Bearer ${LEARNER}.${DEVICE_SECRET}` };
    if (token) headers['X-Guardian-Token'] = token;
    if (ip) headers['CF-Connecting-IP'] = ip;
    const request = new Request(`${ENDPOINT}${path}`, { method: 'POST', headers, body: JSON.stringify(body || {}) });
    const res = await worker.fetch(request, env);
    let respBody = null;
    try {
      respBody = await res.json();
    } catch {
      // ボディ無しは無視
    }
    return { status: res.status, body: respBody };
  }
  const passHashOf = () => env.store.guardians.find((g) => g.learnerId === LEARNER)?.passHash;

  // 1. /link/issue はトークン無しで401
  assert.equal((await call('/link/issue')).status, 401, 'トークン無しで/link/issueは401');

  // 2. /guardian/set: 未設定時は保存される
  const setFirst = await call('/guardian/set', { body: { passcode: 'firstpass' } });
  const rowAfterSet = passHashOf();
  assert.equal(setFirst.status === 200 && setFirst.body?.set === true, true, '未設定時の/guardian/setは200でset:true');
  assert.equal(typeof rowAfterSet === 'string' && rowAfterSet.length > 0, true, '/guardian/set成功でguardians行が作られる');

  // 3. 設定済みなら上書きしない(冪等)
  const setSecond = await call('/guardian/set', { body: { passcode: 'differentpass' } });
  assert.equal(setSecond.status === 200 && setSecond.body?.set === false, true, '設定済みの/guardian/setは200でset:false(上書きしない)');
  assert.equal(passHashOf() === rowAfterSet, true, '2回目の/guardian/setでpassHashが変わらない');

  // 4. 生のパスコード文字列が保存されない
  assert.equal(
    !env.store.guardians.some((g) => g.passHash.includes('firstpass') || g.passHash.includes('differentpass')),
    true,
    'guardians行に生のパスコード文字列が含まれない'
  );

  // 5・6. /guardian/auth
  assert.equal((await call('/guardian/auth', { body: { passcode: 'wrongpass' }, ip: 'auth-wrong-ip' })).status, 401, '誤パスコードの/guardian/authは401');
  const authOk = await call('/guardian/auth', { body: { passcode: 'firstpass' }, ip: 'auth-ok-ip' });
  assert.equal(authOk.status, 200, '正パスコードの/guardian/authは200');
  assert.equal(typeof authOk.body?.token === 'string', true, '正パスコードの/guardian/authはtokenを返す');
  const issuedToken = authOk.body?.token;

  // 7. 同一IPで11回目に429
  const statuses = [];
  for (let i = 0; i < 11; i++) {
    statuses.push((await call('/guardian/auth', { body: { passcode: 'wrongpass' }, ip: 'rate-limit-ip' })).status);
  }
  assert.equal(statuses.slice(0, 10).every((s) => s === 401), true, '/guardian/authは同一IPで1〜10回目は401(レート制限内)');
  assert.equal(statuses[10], 429, '/guardian/authは同一IPで11回目に429');

  // 8・9. /link/issue のトークン検証
  assert.equal((await call('/link/issue', { token: issuedToken })).status, 200, '正トークンで/link/issueは200');
  const expiredToken = await makeToken(LEARNER, passHashOf(), Date.now() - 1000);
  assert.equal((await call('/link/issue', { token: expiredToken })).status, 401, '期限切れトークンで/link/issueは401');

  // 10・11. /guardian/change の入力検証
  assert.equal((await call('/guardian/change', { body: { current: 'firstpass', next: 'abc' } })).status, 400, '/guardian/changeは3文字以下の新パスコードを400で拒否する');
  assert.equal((await call('/guardian/change', { body: { current: 'wrongcurrent', next: 'newpass1' } })).status, 401, '/guardian/changeはcurrent不一致で401');

  // 12. 変更後は変更前のトークンが失効する
  const tokenBeforeChange = await makeToken(LEARNER, passHashOf(), Date.now() + 60 * 60 * 1000);
  assert.equal((await call('/link/issue', { token: tokenBeforeChange })).status, 200, '変更前に発行したトークンは変更前なら/link/issueで200');
  assert.equal((await call('/guardian/change', { body: { current: 'firstpass', next: 'newpass1' } })).status, 200, '/guardian/changeは成功時200');
  assert.equal((await call('/link/issue', { token: tokenBeforeChange })).status, 401, 'パスコード変更後、変更前に発行したトークンで/link/issueが401になる');

  // 13. 新パスコードで認証できる
  assert.equal((await call('/guardian/auth', { body: { passcode: 'newpass1' }, ip: 'after-change-ip' })).status, 200, '変更後の新パスコードで/guardian/authが200');
});
