// #618 段1: GET/PUT /api/index。実 lessons/ は書き換えず、一時ディレクトリで行う。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { startEditorServer } from '../tools/editor/serve.mjs';
import { setDevOnly, moveLesson, moveLessonToUnit, addUnit, removeUnit, renameUnit, addTrack, removeTrack, renameTrack } from '../tools/editor/layout-state.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function setup() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'editor-index-'));
  const lessonsDir = path.join(tmp, 'lessons');
  fs.cpSync(path.join(ROOT, 'lessons'), lessonsDir, { recursive: true });
  return { lessonsDir, backupsDir: path.join(tmp, 'backups'), indexFile: path.join(lessonsDir, 'index.json') };
}

function call(port, method, urlPath, body, raw = false) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: urlPath, method, headers: { 'Content-Type': 'application/json' } }, (res) => {
      let s = '';
      res.on('data', (c) => { s += c; });
      res.on('end', () => resolve({ status: res.statusCode, json: JSON.parse(s) }));
    });
    req.on('error', reject);
    req.end(body === undefined ? undefined : (raw ? body : JSON.stringify(body)));
  });
}

async function withServer(opts, fn) {
  const server = await startEditorServer({ port: 0, ...opts });
  try { await fn(server.address().port); } finally { await new Promise((r) => server.close(r)); }
}

const backupsOf = (dir, prefix) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.startsWith(prefix)) : []);
const unitIdOf = (dir, id) => JSON.parse(fs.readFileSync(path.join(dir, `${id}.json`), 'utf8')).unitId;
const readIndex = (s) => JSON.parse(fs.readFileSync(s.indexFile, 'utf8'));
const unitOf = (idx, unitId) => idx.tracks.flatMap((t) => t.units).find((u) => u.unitId === unitId);

test('GET /api/index: 現在の index.json を返す', async () => {
  const s = setup();
  await withServer(s, async (port) => {
    const r = await call(port, 'GET', '/api/index');
    assert.equal(r.status, 200);
    assert.deepEqual(r.json, readIndex(s));
  });
});

test('PUT /api/index: 変更なしで送ると index.json は1バイトも変わらない', async () => {
  const s = setup();
  const before = fs.readFileSync(s.indexFile);
  await withServer(s, async (port) => {
    const r = await call(port, 'PUT', '/api/index', JSON.parse(before.toString('utf8')));
    assert.equal(r.status, 200, JSON.stringify(r.json));
  });
  assert.deepEqual(fs.readFileSync(s.indexFile), before);
});

test('切替→保存で index.json が更新され、退避が1件増える。戻しも通る', async () => {
  const s = setup();
  await withServer(s, async (port) => {
    const idx = (await call(port, 'GET', '/api/index')).json;
    const toDev = setDevOnly(idx, 'cmd-03-naosu', true);
    assert.notEqual(toDev, idx);
    const r = await call(port, 'PUT', '/api/index', toDev);
    assert.equal(r.status, 200, JSON.stringify(r.json));
    const u = unitOf(readIndex(s), 'commands');
    assert.ok(u.devOnlyIds.includes('cmd-03-naosu') && !u.lessonIds.includes('cmd-03-naosu'));
    assert.equal(backupsOf(s.backupsDir, 'index-').length, 1);
    assert.equal((await call(port, 'PUT', '/api/index', setDevOnly(toDev, 'cmd-03-naosu', false))).status, 200);
    const u2 = unitOf(readIndex(s), 'commands');
    assert.ok(u2.lessonIds.includes('cmd-03-naosu') && !u2.devOnlyIds.includes('cmd-03-naosu'));
  });
});

test('並べ替えが保存される', async () => {
  const s = setup();
  await withServer(s, async (port) => {
    const idx = (await call(port, 'GET', '/api/index')).json;
    const r = await call(port, 'PUT', '/api/index', moveLesson(idx, 'ice-02-kabe', -1));
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.deepEqual(unitOf(readIndex(s), 'ice').lessonIds, ['ice-02-kabe', 'ice-01-suberu']);
  });
});

test('単元間の移動: lessons/<id>.json の unitId が変わり、退避され、その後の PUT /api/lessons でも残る', async () => {
  const s = setup();
  await withServer(s, async (port) => {
    const idx = (await call(port, 'GET', '/api/index')).json;
    const r = await call(port, 'PUT', '/api/index', moveLessonToUnit(idx, 'ice-01-suberu', 'keys'));
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.deepEqual(r.json.moved, ['ice-01-suberu']);
    assert.equal(unitIdOf(s.lessonsDir, 'ice-01-suberu'), 'keys');
    assert.equal(backupsOf(s.backupsDir, 'ice-01-suberu-').length, 1);
    assert.equal(backupsOf(s.backupsDir, 'index-').length, 1);
    const steps = (await call(port, 'GET', '/api/lessons/ice-01-suberu')).json.steps;
    assert.equal((await call(port, 'PUT', '/api/lessons/ice-01-suberu', steps)).status, 200);
    assert.equal(unitIdOf(s.lessonsDir, 'ice-01-suberu'), 'keys');
  });
});

test('検査に通らない保存は 400 で、index.json・退避は変わらない', async () => {
  const s = setup();
  const before = fs.readFileSync(s.indexFile);
  await withServer(s, async (port) => {
    const idx = (await call(port, 'GET', '/api/index')).json;
    const bad = (mut) => { const c = JSON.parse(JSON.stringify(idx)); mut(c); return c; };
    const cases = {
      存在しないID: bad((c) => unitOf(c, 'ice').lessonIds.push('no-such-lesson')),
      ID削除: bad((c) => unitOf(c, 'ice').lessonIds.pop()),
      公開が空: bad((c) => { const u = unitOf(c, 'keys'); u.devOnlyIds = u.lessonIds; u.lessonIds = []; }),
      形が不正: { tracks: 'x' },
    };
    for (const [name, body] of Object.entries(cases)) {
      const r = await call(port, 'PUT', '/api/index', body);
      assert.equal(r.status, 400, name);
      assert.ok(r.json.messages.length > 0, name);
    }
    assert.equal((await call(port, 'PUT', '/api/index', '{not json', true)).status, 400);
  });
  assert.deepEqual(fs.readFileSync(s.indexFile), before);
  assert.equal(backupsOf(s.backupsDir, '').length, 0);
});

test('レッスン保存側の index 拒否は変わらない', async () => {
  const s = setup();
  await withServer(s, async (port) => {
    assert.equal((await call(port, 'PUT', '/api/lessons/index', [{}])).status, 400);
  });
});

test('段2: 単元の追加は空のままだと 400、レッスンを移すと通る。題名変更・空の単元の削除も通る', async () => {
  const s = setup();
  await withServer(s, async (port) => {
    const idx = (await call(port, 'GET', '/api/index')).json;
    const withUnit = addUnit(idx, 'robot', 'newu', '新しい単元');
    assert.notEqual(withUnit, idx);
    assert.equal((await call(port, 'PUT', '/api/index', withUnit)).status, 400);
    const moved = moveLessonToUnit(withUnit, 'ice-01-suberu', 'newu');
    const r = await call(port, 'PUT', '/api/index', moved);
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.deepEqual(unitOf(readIndex(s), 'newu').lessonIds, ['ice-01-suberu']);
    assert.equal(unitIdOf(s.lessonsDir, 'ice-01-suberu'), 'newu');
    const renamed = renameUnit(moved, 'newu', 'なおした');
    assert.equal((await call(port, 'PUT', '/api/index', renamed)).status, 200);
    assert.equal(unitOf(readIndex(s), 'newu').title, 'なおした');
    // 空の単元の削除（もう一つ足して、すぐ消す）
    const tmp = removeUnit(addUnit(renamed, 'robot', 'tmpu', '一時'), 'tmpu');
    assert.deepEqual(tmp, renamed);
  });
});

test('段2: 大項目の追加は単元を足すまで 400。足すと通り、空の大項目の削除・題名変更も通る', async () => {
  const s = setup();
  await withServer(s, async (port) => {
    const idx = (await call(port, 'GET', '/api/index')).json;
    const t = addTrack(idx, 'newt', '新しい大項目');
    assert.equal((await call(port, 'PUT', '/api/index', t)).status, 400);
    const withUnit = moveLessonToUnit(addUnit(t, 'newt', 'newu2', '単元'), 'ice-01-suberu', 'newu2');
    const r = await call(port, 'PUT', '/api/index', renameTrack(withUnit, 'newt', '大項目だよ'));
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(readIndex(s).tracks.find((x) => x.trackId === 'newt').title, '大項目だよ');
    assert.deepEqual(removeTrack(addTrack(idx, 'zz', 'Z'), 'zz'), idx);
  });
});

test('段2: 追加・削除の後の index は validateIndex が通る', async () => {
  const s = setup();
  const { validateIndex } = await import('../tools/lib/validate/index-check.mjs');
  await withServer(s, async (port) => {
    const idx = (await call(port, 'GET', '/api/index')).json;
    const next = moveLessonToUnit(addUnit(idx, 'robot', 'newu3', '単元3'), 'key-01-kagi', 'newu3');
    assert.equal((await call(port, 'PUT', '/api/index', next)).status, 200);
  });
  const lessonById = new Map();
  for (const f of fs.readdirSync(s.lessonsDir)) if (f.endsWith('.json') && f !== 'index.json') lessonById.set(f.slice(0, -5), JSON.parse(fs.readFileSync(path.join(s.lessonsDir, f), 'utf8')));
  assert.deepEqual(validateIndex(readIndex(s), lessonById, new Set(lessonById.keys())), []);
});
