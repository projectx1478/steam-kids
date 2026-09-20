// Issue #38: workers/steam-kids-sync/src/index.js の /guardian/set・/guardian/auth・
// /guardian/change・/link/issueのトークンガードを、疑似D1で直接検証する。
// p3-link-worker.mjsと同方式（Workers固有APIに依存しない標準ESモジュールのみ使用する
// 静的配信本体をdynamic importし、env.DBだけをインメモリ実装に差し替える）。

export const name = 'Worker: 保護者トークンで/link/issueを保護する(Issue #38)';

export default async function run({ page, check }) {
  await page.goto('/');

  const result = await page.evaluate(async () => {
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

    const mod = await import('/workers/steam-kids-sync/src/index.js');
    const worker = mod.default;
    const ORIGIN = 'https://projectx1478.github.io';
    const ENDPOINT = 'https://steam-kids-sync.projectx1478.workers.dev';
    const LEARNER = 'aaaaaaaa-1111-1111-1111-111111111111';
    const DEVICE_SECRET = 'd'.repeat(32);
    const IP = '203.0.113.1';

    async function call(path, { body, token, ip } = {}) {
      const headers = { 'Content-Type': 'application/json', Origin: ORIGIN, Authorization: `Bearer ${LEARNER}.${DEVICE_SECRET}` };
      if (token) headers['X-Guardian-Token'] = token;
      if (ip) headers['CF-Connecting-IP'] = ip;
      const request = new Request(`${ENDPOINT}${path}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body || {}),
      });
      const res = await worker.fetch(request, env);
      let respBody = null;
      try {
        respBody = await res.json();
      } catch {
        // ボディ無しは無視
      }
      return { status: res.status, body: respBody };
    }

    const deviceSecretHash = await sha256Hex(DEVICE_SECRET);
    const env = createFakeDB({ devices: [{ secretHash: deviceSecretHash, learnerId: LEARNER, createdAt: 0 }] });

    const outcome = {};

    // 1. /link/issue はトークン無しで401
    {
      const r = await call('/link/issue');
      outcome.noTokenStatus = r.status;
    }

    // 2. /guardian/set: 未設定時は保存される
    {
      const r = await call('/guardian/set', { body: { passcode: 'firstpass' } });
      outcome.setFirstStatus = r.status;
      outcome.setFirstBody = r.body;
      outcome.guardianRowAfterSet = env.store.guardians.find((g) => g.learnerId === LEARNER)?.passHash;
    }

    // 3. /guardian/set: 設定済みなら上書きしない(冪等)
    {
      const r = await call('/guardian/set', { body: { passcode: 'differentpass' } });
      outcome.setSecondStatus = r.status;
      outcome.setSecondBody = r.body;
      outcome.guardianRowUnchanged = env.store.guardians.find((g) => g.learnerId === LEARNER)?.passHash;
    }

    // 4. guardians行に生のパスコード文字列が含まれない
    outcome.rawPasscodeNotStored = !env.store.guardians.some(
      (g) => g.passHash.includes('firstpass') || g.passHash.includes('differentpass')
    );

    // 5. /guardian/auth: 誤パスコードで401
    {
      const r = await call('/guardian/auth', { body: { passcode: 'wrongpass' }, ip: 'auth-wrong-ip' });
      outcome.authWrongStatus = r.status;
    }

    // 6. /guardian/auth: 正パスコードで200・トークンが発行される
    let issuedToken;
    {
      const r = await call('/guardian/auth', { body: { passcode: 'firstpass' }, ip: 'auth-ok-ip' });
      outcome.authOkStatus = r.status;
      outcome.authOkHasToken = typeof r.body?.token === 'string';
      issuedToken = r.body?.token;
    }

    // 7. /guardian/auth: 同一IPで11回目に429
    {
      const rateIp = 'rate-limit-ip';
      const statuses = [];
      for (let i = 0; i < 11; i++) {
        const r = await call('/guardian/auth', { body: { passcode: 'wrongpass' }, ip: rateIp });
        statuses.push(r.status);
      }
      outcome.rateLimitFirst10All401 = statuses.slice(0, 10).every((s) => s === 401);
      outcome.rateLimit11thIs429 = statuses[10];
    }

    // 8. /link/issue: 正トークンで200
    {
      const r = await call('/link/issue', { token: issuedToken });
      outcome.validTokenStatus = r.status;
    }

    // 9. /link/issue: exp経過後のトークンで401
    {
      const passHash = env.store.guardians.find((g) => g.learnerId === LEARNER).passHash;
      const expiredToken = await makeToken(LEARNER, passHash, Date.now() - 1000);
      const r = await call('/link/issue', { token: expiredToken });
      outcome.expiredTokenStatus = r.status;
    }

    // 10. /guardian/change: 3文字以下の新パスコードは400
    {
      const r = await call('/guardian/change', { body: { current: 'firstpass', next: 'abc' } });
      outcome.changeTooShortStatus = r.status;
    }

    // 11. /guardian/change: current不一致は401
    {
      const r = await call('/guardian/change', { body: { current: 'wrongcurrent', next: 'newpass1' } });
      outcome.changeWrongCurrentStatus = r.status;
    }

    // 12. パスコード変更後、変更前に発行したトークンで/link/issueが401になる
    let validTokenBeforeChange;
    {
      const passHashBefore = env.store.guardians.find((g) => g.learnerId === LEARNER).passHash;
      validTokenBeforeChange = await makeToken(LEARNER, passHashBefore, Date.now() + 60 * 60 * 1000);
      const preCheck = await call('/link/issue', { token: validTokenBeforeChange });
      outcome.preChangeTokenStillValid = preCheck.status;

      const changeRes = await call('/guardian/change', { body: { current: 'firstpass', next: 'newpass1' } });
      outcome.changeOkStatus = changeRes.status;

      const postCheck = await call('/link/issue', { token: validTokenBeforeChange });
      outcome.postChangeOldTokenStatus = postCheck.status;
    }

    // 13. 変更後の新パスコードで/guardian/authが通る
    {
      const r = await call('/guardian/auth', { body: { passcode: 'newpass1' }, ip: 'after-change-ip' });
      outcome.authWithNewPasscodeStatus = r.status;
    }

    return outcome;
  });

  await check('トークン無しで/link/issueは401', () => result.noTokenStatus === 401);

  await check('未設定時の/guardian/setは200でset:true', () => result.setFirstStatus === 200 && result.setFirstBody?.set === true);
  await check('/guardian/set成功でguardians行が作られる', () => typeof result.guardianRowAfterSet === 'string' && result.guardianRowAfterSet.length > 0);
  await check('設定済みの/guardian/setは200でset:false(上書きしない)', () => result.setSecondStatus === 200 && result.setSecondBody?.set === false);
  await check('2回目の/guardian/setでpassHashが変わらない', () => result.guardianRowUnchanged === result.guardianRowAfterSet);
  await check('guardians行に生のパスコード文字列が含まれない', () => result.rawPasscodeNotStored === true);

  await check('誤パスコードの/guardian/authは401', () => result.authWrongStatus === 401);
  await check('正パスコードの/guardian/authは200', () => result.authOkStatus === 200);
  await check('正パスコードの/guardian/authはtokenを返す', () => result.authOkHasToken === true);

  await check('/guardian/authは同一IPで1〜10回目は401(レート制限内)', () => result.rateLimitFirst10All401 === true);
  await check('/guardian/authは同一IPで11回目に429', () => result.rateLimit11thIs429 === 429);

  await check('正トークンで/link/issueは200', () => result.validTokenStatus === 200);
  await check('期限切れトークンで/link/issueは401', () => result.expiredTokenStatus === 401);

  await check('/guardian/changeは3文字以下の新パスコードを400で拒否する', () => result.changeTooShortStatus === 400);
  await check('/guardian/changeはcurrent不一致で401', () => result.changeWrongCurrentStatus === 401);

  await check('変更前に発行したトークンは変更前なら/link/issueで200', () => result.preChangeTokenStillValid === 200);
  await check('/guardian/changeは成功時200', () => result.changeOkStatus === 200);
  await check(
    'パスコード変更後、変更前に発行したトークンで/link/issueが401になる',
    () => result.postChangeOldTokenStatus === 401
  );
  await check('変更後の新パスコードで/guardian/authが200', () => result.authWithNewPasscodeStatus === 200);
}
