// #402 段1: レッスンの読み書き API（GET/PUT /api/lessons）。実 lessons/ は書き換えず、一時ディレクトリへ複製して行う。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { createLessonState, addTutorialStep, setStepText, createState } from '../tools/editor/editor-state.js';
import { startEditorServer, checkLessonId, backupLesson, backupStamp, BACKUP_KEEP } from '../tools/editor/serve.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ID = 'ice-01-suberu';

function setup() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'editor-lessons-'));
  const lessonsDir = path.join(tmp, 'lessons');
  const backupsDir = path.join(tmp, 'backups');
  fs.cpSync(path.join(ROOT, 'lessons'), lessonsDir, { recursive: true });
  return { tmp, lessonsDir, backupsDir };
}

function call(port, method, urlPath, body, raw = false) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: urlPath, method, headers: { 'Content-Type': 'application/json' } }, (res) => {
      let s = '';
      res.on('data', (c) => { s += c; });
      res.on('end', () => resolve({ status: res.statusCode, json: s.startsWith('{') || s.startsWith('[') ? JSON.parse(s) : s }));
    });
    req.on('error', reject);
    req.end(body === undefined ? undefined : (raw ? body : JSON.stringify(body)));
  });
}

async function withServer(opts, fn) {
  const server = await startEditorServer({ port: 0, ...opts });
  try { await fn(server.address().port); } finally { await new Promise((r) => server.close(r)); }
}

const listBackups = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).sort() : []);

test('checkLessonId: ^[a-z0-9-]+$ のみ。index と .. は不可', () => {
  assert.deepEqual(checkLessonId('ice-01-suberu'), []);
  for (const bad of ['', '..', '../x', 'a/b', 'a\\b', 'A', 'a.b', 'index', 'a b', undefined]) {
    assert.ok(checkLessonId(bad).length > 0, `NG のはず: ${bad}`);
  }
});

test('GET /api/lessons と /api/lessons/:id', async () => {
  const { tmp, lessonsDir, backupsDir } = setup();
  try {
    await withServer({ lessonsDir, backupsDir }, async (port) => {
      const list = await call(port, 'GET', '/api/lessons');
      assert.equal(list.status, 200);
      assert.ok(list.json.some((l) => l.lessonId === ID && l.stepCount > 0));
      assert.ok(!list.json.some((l) => l.lessonId === 'index'));
      const one = await call(port, 'GET', `/api/lessons/${ID}`);
      assert.equal(one.status, 200);
      assert.equal(one.json.ok, true);
      assert.deepEqual(one.json.steps, JSON.parse(fs.readFileSync(path.join(lessonsDir, `${ID}.json`), 'utf8')).steps);
      assert.equal((await call(port, 'GET', '/api/lessons/no-such-lesson')).status, 404);
      assert.equal((await call(port, 'GET', '/api/lessons/index')).status, 400);
      assert.equal((await call(port, 'GET', '/api/lessons/..%2Fpackage')).status, 400);
      assert.equal((await call(port, 'GET', '/api/lessons/%E0%A4%A')).status, 400);
    });
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('PUT: パス検査（index・不正な id は 400、存在しない id は 404 で何も作らない）', async () => {
  const { tmp, lessonsDir, backupsDir } = setup();
  try {
    await withServer({ lessonsDir, backupsDir }, async (port) => {
      const before = fs.readFileSync(path.join(lessonsDir, 'index.json'), 'utf8');
      const steps = JSON.parse(fs.readFileSync(path.join(lessonsDir, `${ID}.json`), 'utf8')).steps;
      assert.equal((await call(port, 'PUT', '/api/lessons/index', steps)).status, 400);
      assert.equal((await call(port, 'PUT', '/api/lessons/..%2Fevil', steps)).status, 400);
      assert.equal((await call(port, 'PUT', '/api/lessons/UPPER', steps)).status, 400);
      const nf = await call(port, 'PUT', '/api/lessons/brand-new', steps);
      assert.equal(nf.status, 404);
      assert.ok(!fs.existsSync(path.join(lessonsDir, 'brand-new.json')));
      assert.equal(fs.readFileSync(path.join(lessonsDir, 'index.json'), 'utf8'), before);
      assert.deepEqual(listBackups(backupsDir), []);
      assert.deepEqual(listBackups(path.join(tmp)).filter((f) => f.endsWith('.json')), []);
    });
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('PUT: 壊れた body・不合格の steps は 400 で書かず、退避も作らない', async () => {
  const { tmp, lessonsDir, backupsDir } = setup();
  try {
    await withServer({ lessonsDir, backupsDir }, async (port) => {
      const file = path.join(lessonsDir, `${ID}.json`);
      const before = fs.readFileSync(file, 'utf8');
      const steps = JSON.parse(before).steps;
      assert.equal((await call(port, 'PUT', `/api/lessons/${ID}`, '{broken', true)).status, 400);
      assert.equal((await call(port, 'PUT', `/api/lessons/${ID}`, { steps })).status, 400);
      assert.equal((await call(port, 'PUT', `/api/lessons/${ID}`, [])).status, 400);
      // play の盤を壊す（ゴールを盤の外へ）→ validate で NG
      const broken = JSON.parse(JSON.stringify(steps));
      const play = broken.find((s) => s.kind === 'play');
      play.goal = { x: 99, y: 99 };
      const ng = await call(port, 'PUT', `/api/lessons/${ID}`, broken);
      assert.equal(ng.status, 400);
      assert.ok(Array.isArray(ng.json.messages) && ng.json.messages.length > 0);
      assert.equal(fs.readFileSync(file, 'utf8'), before, 'NG のときファイルは変わらない');
      assert.deepEqual(listBackups(backupsDir), []);
    });
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('PUT: 検査が時間切れなら 400 で書かない', async () => {
  const { tmp, lessonsDir, backupsDir } = setup();
  try {
    await withServer({ lessonsDir, backupsDir, saveTimeoutMs: 1 }, async (port) => {
      const file = path.join(lessonsDir, `${ID}.json`);
      const before = fs.readFileSync(file, 'utf8');
      const r = await call(port, 'PUT', `/api/lessons/${ID}`, JSON.parse(before).steps);
      assert.equal(r.status, 400);
      assert.match(r.json.messages[0], /時間切れ/);
      assert.equal(fs.readFileSync(file, 'utf8'), before);
      assert.deepEqual(listBackups(backupsDir), []);
    });
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('PUT: 合格なら退避してから書き、{ok:true}。退避は直近10件', async () => {
  const { tmp, lessonsDir, backupsDir } = setup();
  try {
    await withServer({ lessonsDir, backupsDir }, async (port) => {
      const file = path.join(lessonsDir, `${ID}.json`);
      const before = fs.readFileSync(file, 'utf8');
      const steps = JSON.parse(before).steps;
      const r = await call(port, 'PUT', `/api/lessons/${ID}`, steps);
      assert.equal(r.status, 200, JSON.stringify(r.json));
      assert.deepEqual(r.json, { ok: true });
      const backups = listBackups(backupsDir);
      assert.equal(backups.length, 1);
      assert.match(backups[0], new RegExp(`^${ID}-\\d{8}-\\d{6}\\.json$`));
      assert.equal(fs.readFileSync(path.join(backupsDir, backups[0]), 'utf8'), before, '退避は書く前の内容');
      assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')).steps, steps);
      assert.ok(!fs.readdirSync(lessonsDir).some((f) => f.startsWith(`${ID}-2`)), 'lessons/ に退避を置かない');
      for (let i = 0; i < BACKUP_KEEP + 2; i++) assert.equal((await call(port, 'PUT', `/api/lessons/${ID}`, steps)).status, 200);
      assert.equal(listBackups(backupsDir).length, BACKUP_KEEP);
    });
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('backupLesson: 名前は <id>-YYYYMMDD-HHmmss、同じ秒は連番、別レッスンの退避は消さない', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'editor-backup-'));
  try {
    assert.equal(backupStamp(new Date(2026, 9, 13, 8, 5, 9)), '20261013-080509');
    const now = new Date(2026, 9, 13, 8, 5, 9);
    await backupLesson('ice-01', 'other', tmp, now);
    for (let i = 0; i < BACKUP_KEEP + 3; i++) await backupLesson('ice-01-suberu', `v${i}`, tmp, now);
    const files = listBackups(tmp);
    assert.ok(files.includes('ice-01-20261013-080509.json'), '別レッスン（接頭辞が同じ id）の退避は残る');
    const mine = files.filter((f) => f.startsWith('ice-01-suberu-'));
    assert.equal(mine.length, BACKUP_KEEP);
    // 残るのは最新の10件（v3..v12）。同秒の連番 -10 以降を含み、最古（素の名前・-2・-3）が消える
    const kept = mine.map((f) => fs.readFileSync(path.join(tmp, f), 'utf8')).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
    assert.deepEqual(kept, Array.from({ length: BACKUP_KEEP }, (_, i) => `v${i + 3}`));
    assert.ok(!mine.includes('ice-01-suberu-20261013-080509.json'), '最古（素の名前）は消える');
    assert.ok(mine.includes('ice-01-suberu-20261013-080509-13.json'), '最後に書いた退避が残る');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('PUT: { steps, keepHandwritten } は stageGen.keepHandwritten を保存する。stageGen の無いレッスンは 400', async () => {
  const { tmp, lessonsDir, backupsDir } = setup();
  try {
    await withServer({ lessonsDir, backupsDir }, async (port) => {
      const sg = 'donguri-02-mawarimichi';
      const file = path.join(lessonsDir, `${sg}.json`);
      const lesson = JSON.parse(fs.readFileSync(file, 'utf8'));
      const got = await call(port, 'GET', `/api/lessons/${sg}`);
      assert.deepEqual(got.json.keepHandwritten, ['p1', 'p2']);
      assert.equal((await call(port, 'GET', `/api/lessons/${ID}`)).json.keepHandwritten, null);
      const steps = JSON.parse(JSON.stringify(lesson.steps));
      delete steps.find((s) => s.stepId === 'p3').gen;
      const r = await call(port, 'PUT', `/api/lessons/${sg}`, { steps, keepHandwritten: ['p1', 'p2', 'p3'] });
      assert.equal(r.status, 200, JSON.stringify(r.json));
      const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
      assert.deepEqual(saved.stageGen.keepHandwritten, ['p1', 'p2', 'p3']);
      assert.equal('gen' in saved.steps.find((s) => s.stepId === 'p3'), false);
      // 連続でない keepHandwritten は検査で断られ、ファイルは変わらない
      const before = fs.readFileSync(file, 'utf8');
      const ng = await call(port, 'PUT', `/api/lessons/${sg}`, { steps, keepHandwritten: ['p1', 'p3'] });
      assert.equal(ng.status, 400);
      assert.equal(fs.readFileSync(file, 'utf8'), before);
      // stageGen の無いレッスンに keepHandwritten は保存できない
      const none = await call(port, 'PUT', `/api/lessons/${ID}`, { steps: JSON.parse(fs.readFileSync(path.join(lessonsDir, `${ID}.json`), 'utf8')).steps, keepHandwritten: [] });
      assert.equal(none.status, 400);
    });
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

// #617 段1: tutorial 付きの steps（エディタの addTutorialStep が作る形）を PUT する。題材は tutorial の無い ice-02-kabe。
function tutorialSteps(lessonsDir, text) {
  const steps = JSON.parse(fs.readFileSync(path.join(lessonsDir, 'ice-02-kabe.json'), 'utf8')).steps;
  const ls = createLessonState('ice-02-kabe', steps);
  const p1 = steps.find((s) => s.stepId === 'p1');
  assert.equal(addTutorialStep(ls, p1).ok, true);
  const state = createState(ls.steps[ls.selected]);
  assert.equal(setStepText(state, text).ok, true);
  ls.steps[ls.selected] = state.spec;
  ls.steps[ls.selected].script = ['right', 'down', 'down', 'down'].map((tap) => ({ tap })).concat([{ tap: 'run' }]);
  return ls.steps;
}

test('PUT(tutorial): tutorial 付きの steps を保存できる', async () => {
  const { tmp, lessonsDir, backupsDir } = setup();
  try {
    await withServer({ lessonsDir, backupsDir }, async (port) => {
      const r = await call(port, 'PUT', '/api/lessons/ice-02-kabe', tutorialSteps(lessonsDir, 'ここを おす'));
      assert.equal(r.status, 200, JSON.stringify(r.json));
      const saved = JSON.parse(fs.readFileSync(path.join(lessonsDir, 'ice-02-kabe.json'), 'utf8')).steps;
      const t = saved.find((s) => s.kind === 'tutorial');
      assert.equal(t.text, 'ここを おす');
      assert.equal(saved.indexOf(t), 1);
    });
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('PUT(tutorial): 文言違反（20字超）は 400 で書かない', async () => {
  const { tmp, lessonsDir, backupsDir } = setup();
  try {
    await withServer({ lessonsDir, backupsDir }, async (port) => {
      const file = path.join(lessonsDir, 'ice-02-kabe.json');
      const before = fs.readFileSync(file, 'utf8');
      const r = await call(port, 'PUT', '/api/lessons/ice-02-kabe', tutorialSteps(lessonsDir, 'あ'.repeat(25)));
      assert.equal(r.status, 400);
      assert.ok(r.json.messages.some((m) => m.includes('文字数')), JSON.stringify(r.json.messages));
      assert.equal(fs.readFileSync(file, 'utf8'), before);
    });
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});
