// steam-kids 同期API。仕様は docs/design-sync.md、経緯は Issue #20。
// 認証はアカウントを作らない端末シークレット方式。devices.secretHash は
// syncSecret の SHA-256（生の秘密情報は保存しない）。

const ALLOWED_ORIGIN = 'https://projectx1478.github.io';
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 0/O/1/I を除いた32文字
const CODE_LENGTH = 6;
const CODE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_SYNC_EVENTS = 500;
const MAX_SYNC_BYTES = 512 * 1024;
const MAX_PULL_EVENTS = 1000;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 10;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SECRET_RE = /^[A-Za-z0-9_-]{20,100}$/;

function corsHeaders(origin) {
  if (origin !== ALLOWED_ORIGIN) return {};
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

function json(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
  });
}

function errorResponse(message, status, origin) {
  return json({ error: message }, status, origin);
}

async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function randomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return code;
}

// Authorization: Bearer <learnerId>.<syncSecret>。learnerIdは表示用で信用しない。
function extractSyncSecret(request) {
  const header = request.headers.get('Authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/);
  if (!match) return null;
  const token = match[1];
  const dot = token.indexOf('.');
  if (dot === -1) return null;
  const secret = token.slice(dot + 1);
  return SECRET_RE.test(secret) ? secret : null;
}

async function authenticate(request, env) {
  const secret = extractSyncSecret(request);
  if (!secret) return null;
  const secretHash = await sha256Hex(secret);
  const row = await env.DB.prepare('SELECT learnerId FROM devices WHERE secretHash = ?')
    .bind(secretHash)
    .first();
  return row ? { learnerId: row.learnerId } : null;
}

async function checkRateLimit(env, bucket, ip) {
  const key = `${bucket}:${ip}`;
  const now = Date.now();
  const windowStart = Math.floor(now / RATE_LIMIT_WINDOW_MS) * RATE_LIMIT_WINDOW_MS;
  const row = await env.DB.prepare('SELECT windowStart, count FROM rate_limits WHERE key = ?')
    .bind(key)
    .first();
  if (!row || row.windowStart !== windowStart) {
    await env.DB.prepare(
      'INSERT INTO rate_limits (key, windowStart, count) VALUES (?, ?, 1) ' +
        'ON CONFLICT(key) DO UPDATE SET windowStart = excluded.windowStart, count = 1'
    )
      .bind(key, windowStart)
      .run();
    return true;
  }
  if (row.count >= RATE_LIMIT_MAX) return false;
  await env.DB.prepare('UPDATE rate_limits SET count = count + 1 WHERE key = ?').bind(key).run();
  return true;
}

async function handleRegister(request, env, origin) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (!(await checkRateLimit(env, 'register', ip))) {
    return errorResponse('too_many_requests', 429, origin);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse('invalid_json', 400, origin);
  }
  const { learnerId, syncSecret } = body || {};
  if (typeof learnerId !== 'string' || !UUID_RE.test(learnerId)) {
    return errorResponse('invalid_learner_id', 400, origin);
  }
  if (typeof syncSecret !== 'string' || !SECRET_RE.test(syncSecret)) {
    return errorResponse('invalid_sync_secret', 400, origin);
  }

  const secretHash = await sha256Hex(syncSecret);
  const existingBySecret = await env.DB.prepare('SELECT learnerId FROM devices WHERE secretHash = ?')
    .bind(secretHash)
    .first();
  if (existingBySecret) {
    if (existingBySecret.learnerId === learnerId) {
      return json({ registered: true }, 200, origin);
    }
    return errorResponse('secret_conflict', 409, origin);
  }

  const existingCount = await env.DB.prepare('SELECT COUNT(*) AS n FROM devices WHERE learnerId = ?')
    .bind(learnerId)
    .first();
  if (existingCount && existingCount.n > 0) {
    return errorResponse('learner_already_registered', 403, origin);
  }

  await env.DB.prepare('INSERT INTO devices (secretHash, learnerId, createdAt) VALUES (?, ?, ?)')
    .bind(secretHash, learnerId, Date.now())
    .run();
  return json({ registered: true }, 200, origin);
}

function isValidEvent(e) {
  return (
    e &&
    typeof e.eventId === 'string' &&
    e.eventId.length > 0 &&
    typeof e.type === 'string' &&
    e.type.length > 0 &&
    typeof e.ts === 'number' &&
    Number.isFinite(e.ts)
  );
}

async function handleSyncPost(request, env, origin, learnerId) {
  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).length > MAX_SYNC_BYTES) {
    return errorResponse('payload_too_large', 413, origin);
  }
  let body;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return errorResponse('invalid_json', 400, origin);
  }
  const events = Array.isArray(body?.events) ? body.events : null;
  if (!events) return errorResponse('invalid_events', 400, origin);
  if (events.length > MAX_SYNC_EVENTS) return errorResponse('payload_too_large', 413, origin);

  const valid = events.filter(isValidEvent);
  if (valid.length === 0) return json({ acceptedCount: 0 }, 200, origin);

  const stmt = env.DB.prepare(
    'INSERT OR IGNORE INTO events (eventId, learnerId, lessonId, stepId, type, ts, payload) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  const batch = valid.map((e) =>
    stmt.bind(
      e.eventId,
      learnerId,
      typeof e.lessonId === 'string' ? e.lessonId : null,
      typeof e.stepId === 'string' ? e.stepId : null,
      e.type,
      e.ts,
      JSON.stringify(e.payload ?? {})
    )
  );
  const results = await env.DB.batch(batch);
  const acceptedCount = results.reduce((sum, r) => sum + (r.meta?.changes || 0), 0);
  return json({ acceptedCount }, 200, origin);
}

async function handleSyncGet(request, env, origin, learnerId) {
  const url = new URL(request.url);
  const sinceParam = Number(url.searchParams.get('since'));
  const since = Number.isFinite(sinceParam) ? sinceParam : 0;
  const { results } = await env.DB.prepare(
    'SELECT eventId, learnerId, lessonId, stepId, type, ts, payload FROM events ' +
      'WHERE learnerId = ? AND ts >= ? ORDER BY ts ASC LIMIT ?'
  )
    .bind(learnerId, since, MAX_PULL_EVENTS)
    .all();
  const events = results.map((row) => ({
    eventId: row.eventId,
    learnerId: row.learnerId,
    lessonId: row.lessonId,
    stepId: row.stepId,
    type: row.type,
    ts: row.ts,
    payload: JSON.parse(row.payload || '{}'),
  }));
  return json({ events }, 200, origin);
}

async function handleLinkIssue(request, env, origin, learnerId) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomCode();
    const existing = await env.DB.prepare('SELECT code FROM link_codes WHERE code = ?').bind(code).first();
    if (existing) continue;
    const expiresAt = Date.now() + CODE_TTL_MS;
    await env.DB.prepare(
      'INSERT INTO link_codes (code, learnerId, expiresAt, usedAt) VALUES (?, ?, ?, NULL)'
    )
      .bind(code, learnerId, expiresAt)
      .run();
    return json({ code, expiresAt }, 200, origin);
  }
  return errorResponse('code_generation_failed', 500, origin);
}

async function handleLinkRedeem(request, env, origin) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (!(await checkRateLimit(env, 'link_redeem', ip))) {
    return errorResponse('too_many_requests', 429, origin);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse('invalid_json', 400, origin);
  }
  const rawCode = typeof body?.code === 'string' ? body.code.toUpperCase() : '';
  const syncSecret = body?.syncSecret;
  if (rawCode.length !== CODE_LENGTH) return errorResponse('invalid_code', 400, origin);
  if (typeof syncSecret !== 'string' || !SECRET_RE.test(syncSecret)) {
    return errorResponse('invalid_sync_secret', 400, origin);
  }

  const row = await env.DB.prepare('SELECT learnerId, expiresAt, usedAt FROM link_codes WHERE code = ?')
    .bind(rawCode)
    .first();
  if (!row) return errorResponse('code_not_found', 404, origin);
  if (row.usedAt !== null) return errorResponse('code_already_used', 410, origin);
  if (row.expiresAt < Date.now()) return errorResponse('code_expired', 410, origin);

  // まずコード自体を確定して消費する（同時リクエストによる二重使用を防ぐ）。
  // devices/eventsの変更はこの後に限定し、secret_conflict等の判定失敗ではコードを消費しない。
  const claim = await env.DB.prepare('UPDATE link_codes SET usedAt = ? WHERE code = ? AND usedAt IS NULL')
    .bind(Date.now(), rawCode)
    .run();
  if (!claim.meta || claim.meta.changes !== 1) {
    return errorResponse('code_already_used', 410, origin);
  }

  const secretHash = await sha256Hex(syncSecret);
  const existingBySecret = await env.DB.prepare('SELECT learnerId FROM devices WHERE secretHash = ?')
    .bind(secretHash)
    .first();
  const oldLearnerId = existingBySecret && existingBySecret.learnerId !== row.learnerId
    ? existingBySecret.learnerId
    : null;

  if (!existingBySecret) {
    await env.DB.prepare('INSERT INTO devices (secretHash, learnerId, createdAt) VALUES (?, ?, ?)')
      .bind(secretHash, row.learnerId, Date.now())
      .run();
  } else if (oldLearnerId) {
    // 既にこの端末が別のlearnerIdへ同期済みだった場合、コード提示を本人確認として
    // 発行元のlearnerIdへ端末を付け替える（学習履歴は統合する。Issue #33）。
    const statements = [
      env.DB.prepare('UPDATE devices SET learnerId = ? WHERE secretHash = ?').bind(row.learnerId, secretHash),
    ];
    // 旧learnerIdに他の端末が残っている場合は、そちらの履歴を失わせないためイベントを移管しない。
    const otherDevices = await env.DB.prepare('SELECT COUNT(*) AS n FROM devices WHERE learnerId = ?')
      .bind(oldLearnerId)
      .first();
    if (otherDevices && otherDevices.n === 1) {
      statements.push(
        env.DB.prepare('UPDATE events SET learnerId = ? WHERE learnerId = ?').bind(row.learnerId, oldLearnerId)
      );
    }
    await env.DB.batch(statements);
  }

  return json({ learnerId: row.learnerId }, 200, origin);
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (url.pathname === '/register' && request.method === 'POST') {
      return handleRegister(request, env, origin);
    }

    if (url.pathname === '/sync') {
      const auth = await authenticate(request, env);
      if (!auth) return errorResponse('unauthorized', 401, origin);
      if (request.method === 'POST') return handleSyncPost(request, env, origin, auth.learnerId);
      if (request.method === 'GET') return handleSyncGet(request, env, origin, auth.learnerId);
      return errorResponse('method_not_allowed', 405, origin);
    }

    if (url.pathname === '/link/issue' && request.method === 'POST') {
      const auth = await authenticate(request, env);
      if (!auth) return errorResponse('unauthorized', 401, origin);
      return handleLinkIssue(request, env, origin, auth.learnerId);
    }

    if (url.pathname === '/link/redeem' && request.method === 'POST') {
      return handleLinkRedeem(request, env, origin);
    }

    return errorResponse('not_found', 404, origin);
  },
};
