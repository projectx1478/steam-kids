// #685 段2: 公開 API の3方向マージ・差分・公開手順。gh・git は差し替え、本番の PR 作成・自動マージ予約は行わない。実行: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { mergeFace, mergeIndex, pick3 } from '../tools/editor/publish.mjs';
import { startEditorServer, ensureBase } from '../tools/editor/serve.mjs';

const idx = (units, extra = {}) => ({ longTrialIds: ['x'], tracks: [{ trackId: 't1', title: 'T1', units }], ...extra });
const unit = (o = {}) => ({ unitId: 'u1', title: 'U1', icon: 'a', color: 'red', lessonIds: ['l1', 'l2'], practiceIds: [], devOnlyIds: [], ...o });

// ---- 面 ----
test('pick3/mergeFace: main==base→drafts／drafts==base→main／同一内容／両方違う→衝突', () => {
  const b = { steps: [1] }; const d = { steps: [2] }; const m = { steps: [3] };
  assert.deepEqual(mergeFace(b, b, d), { kind: 'drafts', take: true });
  assert.deepEqual(mergeFace(b, m, b), { kind: 'main', take: false });
  assert.deepEqual(mergeFace(b, d, d), { kind: 'main', take: false }); // 同一内容
  assert.equal(mergeFace(b, m, d).kind, 'conflict');
  assert.equal(mergeFace(b, b, { steps: [1] }).take, false);
  assert.equal(pick3(1, 1, 1).kind, 'same');
});

test('mergeFace: キー順だけ違う面は同一とみなす', () => {
  assert.equal(mergeFace({ a: 1, b: 2 }, { b: 2, a: 1 }, { a: 1, b: 3 }).kind, 'drafts');
});

// ---- index ----
test('mergeIndex: 非衝突（main は大項目名、drafts は単元名）→ 両方入る', () => {
  const base = idx([unit()]);
  const main = { ...base, tracks: [{ ...base.tracks[0], title: 'T1改' }] };
  const drafts = idx([unit({ title: 'U1改' })]);
  const r = mergeIndex(base, main, drafts);
  assert.deepEqual(r.conflicts, []);
  assert.equal(r.merged.tracks[0].title, 'T1改');
  assert.equal(r.merged.tracks[0].units[0].title, 'U1改');
  assert.deepEqual(r.items.map((i) => i.category), ['単元名']);
});

test('mergeIndex: 同じ項目を両方が別の値に→衝突（ファイル・項目・値）', () => {
  const base = idx([unit()]);
  const main = idx([unit({ title: 'M' })]);
  const drafts = idx([unit({ title: 'D' })]);
  const r = mergeIndex(base, main, drafts);
  assert.equal(r.conflicts.length, 1);
  assert.equal(r.conflicts[0].file, 'index.json');
  assert.match(r.conflicts[0].item, /u1 の title/);
  assert.equal(r.conflicts[0].base, '"U1"');
  assert.equal(r.conflicts[0].main, '"M"');
  assert.equal(r.conflicts[0].drafts, '"D"');
});

test('mergeIndex: 同一内容の変更は衝突にしない', () => {
  const base = idx([unit()]);
  const both = idx([unit({ color: 'blue' })]);
  const r = mergeIndex(base, both, both);
  assert.deepEqual(r.conflicts, []);
  assert.deepEqual(r.items, []);
});

test('mergeIndex: 公開／非公開と並びの区分・アイコン色・大項目', () => {
  const base = idx([unit()]);
  const drafts = idx([unit({ icon: 'b', lessonIds: ['l2', 'l1'], devOnlyIds: ['z'] })]);
  drafts.tracks[0].title = '新';
  const cats = Object.fromEntries(mergeIndex(base, base, drafts).items.map((i) => [i.label, i.category]));
  assert.equal(cats['単元 u1 の icon'], 'アイコン・色');
  assert.equal(cats['単元 u1 の lessonIds'], '並び');
  assert.equal(cats['単元 u1 の devOnlyIds'], '公開／非公開');
  assert.equal(cats['大項目 t1 の名前'], '大項目');
});

test('mergeIndex: 単元の追加・並び替えを drafts から取り込む／main の追加も残す', () => {
  const base = idx([unit({ unitId: 'a' }), unit({ unitId: 'b' })]);
  const main = idx([unit({ unitId: 'a' }), unit({ unitId: 'b' }), unit({ unitId: 'm' })]);
  const r = mergeIndex(base, base, idx([unit({ unitId: 'b' }), unit({ unitId: 'a' })]));
  assert.deepEqual(r.merged.tracks[0].units.map((u) => u.unitId), ['b', 'a']);
  const r2 = mergeIndex(base, main, base);
  assert.deepEqual(r2.merged.tracks[0].units.map((u) => u.unitId), ['a', 'b', 'm']);
  assert.deepEqual(r2.items, []);
});

test('mergeIndex: 単元の並びを両方が別順に→衝突／longTrialIds の衝突', () => {
  const base = idx([unit({ unitId: 'a' }), unit({ unitId: 'b' }), unit({ unitId: 'c' })]);
  const r = mergeIndex(base, idx([unit({ unitId: 'b' }), unit({ unitId: 'a' }), unit({ unitId: 'c' })]), idx([unit({ unitId: 'c' }), unit({ unitId: 'b' }), unit({ unitId: 'a' })]));
  assert.ok(r.conflicts.some((c) => /単元/.test(c.item)));
  const r2 = mergeIndex(base, { ...base, longTrialIds: ['m'] }, { ...base, longTrialIds: ['d'] });
  assert.ok(r2.conflicts.some((c) => c.item === 'longTrialIds'));
});

test('mergeIndex: 未知のキーを drafts が変えたら衝突扱い', () => {
  const base = idx([unit()], { extraTop: 1 });
  assert.equal(mergeIndex(base, base, { ...base, extraTop: 2 }).conflicts.length, 1);
  assert.equal(mergeIndex(base, base, idx([unit({ foo: 1 })], { extraTop: 1 })).conflicts.length, 1);
  assert.equal(mergeIndex(base, { ...base, extraTop: 2 }, base).conflicts.length, 0);
});

test('mergeIndex: 単元が2つの大項目に出る→衝突', () => {
  const base = { tracks: [{ trackId: 't1', title: 'A', units: [unit()] }, { trackId: 't2', title: 'B', units: [] }] };
  const drafts = { tracks: [{ trackId: 't1', title: 'A', units: [unit()] }, { trackId: 't2', title: 'B', units: [unit()] }] };
  assert.ok(mergeIndex(base, base, drafts).conflicts.some((c) => /両方に出ます/.test(c.item)));
});

// ---- ensureBase（段1からの引き継ぎ）----
test('ensureBase: 実lessons以外で resolveBase が無ければ書かない／差し替えがあれば書く／拒否なら書かない', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'editor-base-'));
  const pub = path.join(tmp, 'drafts', 'publish');
  const lessonsDir = path.join(tmp, 'lessons');
  assert.deepEqual(await ensureBase({ lessonsDir }, pub), []);
  assert.equal(fs.existsSync(path.join(pub, 'base.json')), false);
  assert.deepEqual(await ensureBase({ lessonsDir, resolveBase: async () => { throw new Error('ずれています'); } }, pub), ['ずれています']);
  assert.equal(fs.existsSync(path.join(pub, 'base.json')), false);
  assert.deepEqual(await ensureBase({ lessonsDir, resolveBase: async () => 'abc1234' }, pub), []);
  assert.equal(JSON.parse(fs.readFileSync(path.join(pub, 'base.json'), 'utf8')).base, 'abc1234');
  assert.deepEqual(await ensureBase({ lessonsDir, resolveBase: async () => 'zzz' }, pub), []); // 既にあれば変えない
  assert.equal(JSON.parse(fs.readFileSync(path.join(pub, 'base.json'), 'utf8')).base, 'abc1234');
});

// ---- API ----
function call(port, method, urlPath) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: urlPath, method }, (res) => {
      let s = '';
      res.on('data', (c) => { s += c; });
      res.on('end', () => resolve({ status: res.statusCode, json: JSON.parse(s) }));
    });
    req.on('error', reject);
    req.end();
  });
}

// git/gh/npm の代役。trees: { base: {name: obj}, main: {name: obj} }。呼び出しを calls に記録する。
function fakeRun(trees, { auth = true, autoMerge = 'true', onPrCreate } = {}) {
  const calls = [];
  const run = async (cmd, args, opts = {}) => {
    calls.push([cmd, ...args].join(' '));
    const fail = (m) => { throw Object.assign(new Error(m), { stderr: m }); };
    if (cmd === 'git' && args[0] === 'show') {
      const [ref, rest] = args[1].split(':lessons/');
      const tree = ref === 'origin/main' ? trees.main : trees.base;
      return tree[rest] === undefined ? fail('not found') : { stdout: JSON.stringify(tree[rest]), stderr: '' };
    }
    if (cmd === 'git' && args[0] === 'merge-base') return trees.ancestor === false ? fail('no') : { stdout: '', stderr: '' };
    if (cmd === 'git' && args[0] === 'worktree') { fs.mkdirSync(path.join(args[2], 'lessons'), { recursive: true }); return { stdout: '', stderr: '' }; }
    if (cmd === 'git' && args[0] === 'status') return { stdout: ' M lessons/a.json\n M lessons/index.json\n', stderr: '' };
    if (cmd === 'gh' && args[0] === 'auth') return auth ? { stdout: '', stderr: '' } : fail('not logged in');
    if (cmd === 'gh' && args[0] === 'api') return { stdout: `${autoMerge}\n`, stderr: '' };
    if (cmd === 'gh' && args[0] === 'pr' && args[1] === 'create') { onPrCreate?.(); return { stdout: 'https://example.invalid/pr/1\n', stderr: '' }; }
    return { stdout: '', stderr: '' };
  };
  return { run, calls };
}

function setupApi(trees, runOpts) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'editor-publish-'));
  const draftsDir = path.join(tmp, 'drafts');
  const pub = path.join(draftsDir, 'publish');
  fs.mkdirSync(path.join(pub, 'lessons'), { recursive: true });
  const fr = fakeRun(trees, runOpts);
  return { tmp, draftsDir, pub, fr, opts: { lessonsDir: path.join(tmp, 'lessons'), backupsDir: path.join(tmp, 'backups'), draftsDir, publishRoot: path.join(tmp, 'root'), publishRun: fr.run } };
}

const face = (n) => ({ lessonId: 'a', steps: [n] });

test('GET /api/publish/preview: 仮保存が無ければ変更ゼロ（base.json が無くても止めない）', async () => {
  const s = setupApi({ base: {}, main: {} });
  const server = await startEditorServer({ port: 0, ...s.opts });
  try {
    const r = await call(server.address().port, 'GET', '/api/publish/preview');
    assert.equal(r.json.empty, true);
    assert.equal(r.json.publishable, false);
    assert.deepEqual(r.json.messages, ['公開する変更がありません']);
  } finally { server.close(); }
});

test('GET /api/publish/preview: 仮保存があるのに base.json が無い→専用文言で止める', async () => {
  const s = setupApi({ base: {}, main: {} });
  fs.writeFileSync(path.join(s.pub, 'lessons', 'a.json'), JSON.stringify(face(2)));
  const server = await startEditorServer({ port: 0, ...s.opts });
  try {
    const r = await call(server.address().port, 'GET', '/api/publish/preview');
    assert.equal(r.json.baseMissing, true);
    assert.equal(r.json.publishable, false);
    assert.match(r.json.messages[0], /base\.json）がありません/);
  } finally { server.close(); }
});

test('GET /api/publish/preview: base が main に無い→履歴が変わりました', async () => {
  const s = setupApi({ base: {}, main: {}, ancestor: false });
  fs.writeFileSync(path.join(s.pub, 'base.json'), JSON.stringify({ base: 'abc1234', at: 'x' }));
  fs.writeFileSync(path.join(s.pub, 'lessons', 'a.json'), JSON.stringify(face(2)));
  const server = await startEditorServer({ port: 0, ...s.opts });
  try {
    const r = await call(server.address().port, 'GET', '/api/publish/preview');
    assert.equal(r.json.baseGone, true);
    assert.equal(r.json.publishable, false);
    assert.match(r.json.messages[0], /履歴が変わりました/);
  } finally { server.close(); }
});

test('GET /api/publish/preview: 面の衝突／非衝突と drafts を変更しないこと', async () => {
  const s = setupApi({ base: { 'a.json': face(1), 'b.json': { lessonId: 'b', steps: [1] } }, main: { 'a.json': face(3), 'b.json': { lessonId: 'b', steps: [1] } } });
  fs.writeFileSync(path.join(s.pub, 'base.json'), JSON.stringify({ base: 'abc1234', at: 'x' }));
  fs.writeFileSync(path.join(s.pub, 'lessons', 'a.json'), JSON.stringify(face(2)));
  fs.writeFileSync(path.join(s.pub, 'lessons', 'b.json'), JSON.stringify({ lessonId: 'b', steps: [2] }));
  const server = await startEditorServer({ port: 0, ...s.opts });
  try {
    const r = await call(server.address().port, 'GET', '/api/publish/preview');
    assert.equal(r.json.publishable, false);
    assert.equal(r.json.conflicts.length, 1);
    assert.equal(r.json.conflicts[0].file, 'a.json');
    assert.deepEqual(r.json.faces, ['b']); // 非衝突の面は変更として数える
    assert.equal(r.json.messages[0], 'main 側も変わっているため公開できません');
    assert.equal(fs.existsSync(path.join(s.pub, 'lessons', 'a.json')), true);
    assert.equal(s.fr.calls.some((c) => c.startsWith('gh pr')), false);
  } finally { server.close(); }
});

async function waitDone(port) {
  for (let i = 0; i < 100; i++) {
    const r = await call(port, 'GET', '/api/publish/status');
    if (r.json.done) return r.json;
    await new Promise((res) => setTimeout(res, 20));
  }
  throw new Error('公開が終わりません');
}

test('POST /api/publish: 手順どおり（差し替えた gh・git）で PR を作り、仮保存を消す。二重実行は 409', async () => {
  const base = idx([unit()]);
  const s = setupApi({ base: { 'a.json': face(1), 'index.json': base }, main: { 'a.json': face(1), 'index.json': base } });
  fs.writeFileSync(path.join(s.pub, 'base.json'), JSON.stringify({ base: 'abc1234', at: 'x' }));
  fs.writeFileSync(path.join(s.pub, 'lessons', 'a.json'), JSON.stringify(face(2)));
  fs.writeFileSync(path.join(s.pub, 'index.json'), JSON.stringify(idx([unit({ title: 'U1改' })])));
  const server = await startEditorServer({ port: 0, ...s.opts });
  const port = server.address().port;
  try {
    const r1 = await call(port, 'POST', '/api/publish');
    assert.equal(r1.status, 202);
    const r2 = await call(port, 'POST', '/api/publish');
    assert.equal(r2.status, 409);
    assert.deepEqual(r2.json.messages, ['公開は実行中です']);
    const st = await waitDone(port);
    assert.equal(st.ok, true, JSON.stringify(st.error));
    assert.equal(st.url, 'https://example.invalid/pr/1');
    const c = s.fr.calls;
    const at = (re) => c.findIndex((x) => re.test(x));
    assert.ok(at(/^gh auth status/) < at(/^gh api repos/) && at(/^gh api repos/) < at(/worktree add/));
    assert.ok(at(/worktree add/) < at(/validate:lessons/) && at(/validate:lessons/) < at(/verify:fast/));
    assert.ok(at(/verify:fast/) < at(/commit/) && at(/commit/) < at(/push -u origin editor\/publish-/));
    assert.ok(at(/push/) < at(/^gh pr create/) && at(/^gh pr create/) < at(/^gh pr merge .* --auto --squash/));
    const wt = c.find((x) => /worktree add/.test(x)).split(' ')[3];
    assert.equal(JSON.parse(fs.readFileSync(path.join(wt, 'lessons', 'a.json'), 'utf8')).steps[0], 2);
    assert.equal(JSON.parse(fs.readFileSync(path.join(wt, 'lessons', 'index.json'), 'utf8')).tracks[0].units[0].title, 'U1改');
    for (const f of ['index.json', 'base.json', path.join('lessons', 'a.json')]) assert.equal(fs.existsSync(path.join(s.pub, f)), false, f);
    assert.equal(c.some((x) => x.includes('Co-Authored')), false);
  } finally { server.close(); }
});

test('POST /api/publish: gh 未ログイン／自動マージ無効／衝突では PR を作らず、仮保存を残す', async () => {
  for (const [runOpts, trees, expect] of [
    [{ auth: false }, { base: { 'a.json': face(1) }, main: { 'a.json': face(1) } }, 'gh にログインしていません'],
    [{ autoMerge: 'false' }, { base: { 'a.json': face(1) }, main: { 'a.json': face(1) } }, '自動マージが無効'],
    [{}, { base: { 'a.json': face(1) }, main: { 'a.json': face(3) } }, 'main 側も変わっているため'],
  ]) {
    const s = setupApi(trees, runOpts);
    fs.writeFileSync(path.join(s.pub, 'base.json'), JSON.stringify({ base: 'abc1234', at: 'x' }));
    fs.writeFileSync(path.join(s.pub, 'lessons', 'a.json'), JSON.stringify(face(2)));
    const server = await startEditorServer({ port: 0, ...s.opts });
    try {
      await call(server.address().port, 'POST', '/api/publish');
      const st = await waitDone(server.address().port);
      assert.equal(st.ok, false);
      assert.ok(st.error.message.includes(expect), st.error.message);
      assert.match(st.error.summary, /で止まりました（仮保存は残っています）/);
      assert.equal(s.fr.calls.some((x) => /^gh pr |worktree add/.test(x)), false);
      assert.equal(fs.existsSync(path.join(s.pub, 'lessons', 'a.json')), true);
    } finally { server.close(); }
  }
});
