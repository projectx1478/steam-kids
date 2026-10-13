// #402 段3: 下書き API（GET/PUT /api/drafts）と、配置時の検査。実 drafts/・lessons/ は書き換えず、一時ディレクトリで行う。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { startEditorServer, checkDraftName, readDraft, writeDraft } from '../tools/editor/serve.mjs';
import { createLessonState, addDraftStep, explainSaveNg } from '../tools/editor/editor-state.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ID = 'ice-01-suberu';

function setup() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'editor-drafts-'));
  const lessonsDir = path.join(tmp, 'lessons');
  fs.cpSync(path.join(ROOT, 'lessons'), lessonsDir, { recursive: true });
  return { tmp, lessonsDir, backupsDir: path.join(tmp, 'backups'), draftsDir: path.join(tmp, 'drafts') };
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

const SPEC = { grid: { cols: 3, rows: 3 }, start: { x: 0, y: 0 }, goal: { x: 2, y: 2 }, walls: [{ x: 1, y: 1 }] };

test('checkDraftName: ^[a-z0-9-]+$ のみ', () => {
  assert.deepEqual(checkDraftName('my-draft-1'), []);
  for (const bad of ['', '..', '../x', 'a/b', 'a\\b', 'A', 'a.b', 'a b', undefined]) assert.ok(checkDraftName(bad).length > 0, `NG のはず: ${bad}`);
});

test('drafts: GET 404 → PUT 200 → GET 200 → 同名は上書き。一覧に出る。保存時は検査しない', async () => {
  const { tmp, lessonsDir, backupsDir, draftsDir } = setup();
  try {
    await withServer({ lessonsDir, backupsDir, draftsDir }, async (port) => {
      assert.equal((await call(port, 'GET', '/api/drafts/d1')).status, 404);
      assert.deepEqual((await call(port, 'GET', '/api/drafts')).json, []);
      const put = await call(port, 'PUT', '/api/drafts/d1', SPEC);
      assert.equal(put.status, 200);
      assert.deepEqual(put.json, { ok: true });
      const got = await call(port, 'GET', '/api/drafts/d1');
      assert.equal(got.status, 200);
      assert.deepEqual(got.json.spec, SPEC);
      const next = { ...SPEC, goal: { x: 1, y: 2 } };
      assert.equal((await call(port, 'PUT', '/api/drafts/d1', next)).status, 200);
      assert.deepEqual((await call(port, 'GET', '/api/drafts/d1')).json.spec, next);
      // 検査しない：ゴールが盤の外・解けない盤でも保存できる
      const broken = { grid: { cols: 2, rows: 2 }, start: { x: 0, y: 0 }, goal: { x: 99, y: 99 } };
      assert.equal((await call(port, 'PUT', '/api/drafts/broken', broken)).status, 200);
      assert.deepEqual((await call(port, 'GET', '/api/drafts')).json, ['broken', 'd1']);
      assert.deepEqual(fs.readdirSync(draftsDir).sort(), ['broken.json', 'd1.json']);
    });
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('drafts: 名前の不正・body の不正は 400 で何も書かない', async () => {
  const { tmp, lessonsDir, backupsDir, draftsDir } = setup();
  try {
    await withServer({ lessonsDir, backupsDir, draftsDir }, async (port) => {
      for (const bad of ['..%2Fx', 'A', 'a.b', 'a%5Cb', '%E0%A4%A']) {
        assert.equal((await call(port, 'PUT', `/api/drafts/${bad}`, SPEC)).status, 400, bad);
        assert.equal((await call(port, 'GET', `/api/drafts/${bad}`)).status, 400, bad);
      }
      assert.equal((await call(port, 'PUT', '/api/drafts/ok', '{broken', true)).status, 400);
      assert.equal((await call(port, 'PUT', '/api/drafts/ok', [SPEC])).status, 400);
      assert.equal((await call(port, 'PUT', '/api/drafts/ok', 'null', true)).status, 400);
      assert.ok(!fs.existsSync(draftsDir) || fs.readdirSync(draftsDir).length === 0);
      assert.ok(!fs.existsSync(path.join(tmp, 'x.json')));
      assert.deepEqual(fs.readdirSync(lessonsDir).filter((f) => f.startsWith('ok')), []);
    });
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('readDraft / writeDraft: dir の外には書かない', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'editor-drafts-fn-'));
  try {
    const dir = path.join(tmp, 'drafts');
    assert.equal(await readDraft('none', dir), null);
    assert.ok((await writeDraft('../evil', SPEC, dir)).length > 0);
    assert.deepEqual(await writeDraft('good', SPEC, dir), []);
    assert.deepEqual(await readDraft('good', dir), SPEC);
    assert.ok(!fs.existsSync(path.join(tmp, 'evil.json')));
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('addDraftStep: 下書きを面として追加（stepId は重ならない・kind=play・gen は外す）', () => {
  const ls = createLessonState('x', [{ stepId: 'p1', kind: 'play', ...SPEC }, { stepId: 'p2', kind: 'play', ...SPEC }]);
  assert.equal(addDraftStep(ls, { grid: 1 }, 'd').ok, false);
  const r = addDraftStep(ls, { ...SPEC, gen: { seed: 1 } }, 'p1', 0);
  assert.equal(r.ok, true);
  assert.deepEqual(ls.steps.map((s) => s.stepId), ['p1', 'p12', 'p2']);
  assert.equal(ls.selected, 1);
  assert.equal(ls.steps[1].kind, 'play');
  assert.equal('gen' in ls.steps[1], false);
  assert.equal(addDraftStep(ls, SPEC, 'z', 99).ok, false);
});

test('配置時の検査：解けない下書きを置いて PUT すると 400。自分の面が原因か分けて返せる。ファイルは変わらない', async () => {
  const { tmp, lessonsDir, backupsDir, draftsDir } = setup();
  try {
    await withServer({ lessonsDir, backupsDir, draftsDir }, async (port) => {
      const file = path.join(lessonsDir, `${ID}.json`);
      const before = fs.readFileSync(file, 'utf8');
      const steps = JSON.parse(before).steps;
      // 下書きは検査なしで保存できる（ゴールが盤の外）
      const bad = { grid: { cols: 3, rows: 3 }, start: { x: 0, y: 0 }, goal: { x: 99, y: 99 } };
      assert.equal((await call(port, 'PUT', '/api/drafts/bad-one', bad)).status, 200);
      const draft = (await call(port, 'GET', '/api/drafts/bad-one')).json.spec;
      const ls = createLessonState(ID, steps);
      const firstPlay = steps.findIndex((s) => s.kind === 'play');
      assert.equal(addDraftStep(ls, draft, 'bad-one', firstPlay).ok, true);
      const placed = ls.steps[ls.selected].stepId;
      const ng = await call(port, 'PUT', `/api/lessons/${ID}`, ls.steps);
      assert.equal(ng.status, 400);
      assert.ok(ng.json.messages.length > 0);
      const explained = explainSaveNg(ng.json.messages, [placed]);
      assert.equal(explained.length, ng.json.messages.length);
      assert.ok(explained.some((e) => e.own), `自分の面が原因の文言がある: ${ng.json.messages.join(' | ')}`);
      assert.ok(explained.every((e) => typeof e.label === 'string' && e.label.length > 0));
      assert.equal(fs.readFileSync(file, 'utf8'), before, 'NG のときレッスンは変わらない');
      assert.ok(!fs.existsSync(backupsDir) || fs.readdirSync(backupsDir).length === 0);
    });
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('explainSaveNg: 自分の面の stepId を含む文言だけ own', () => {
  const r = explainSaveNg(['盤面: stepId="a" の goal が範囲外', '難易度の順序: stepId="b" の最短(3)が…'], ['a']);
  assert.deepEqual(r.map((x) => x.own), [true, false]);
});
