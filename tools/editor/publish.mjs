// #685 段2: エディタの「公開」。drafts/publish/ の仮保存を、base・origin/main・drafts の3方向マージで lessons/ の PR にする。
// 差分は preview()（書かない）、公開は start()（別 worktree で検査→push→PR→自動マージ予約）。gh・git は deps.run で差し替えられる（試験用）。
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { formatLesson } from '../gen-stages.mjs';

export const MSG_NO_CHANGE = '公開する変更がありません';
export const MSG_BASE_GONE = '仮保存の元になった main が見つかりません（履歴が変わりました）。公開できません';
export const MSG_BASE_MISSING = '仮保存の元になった main の記録（base.json）がありません。公開できません';
export const MSG_CONFLICT = 'main 側も変わっているため公開できません';
export const MSG_RUNNING = '公開は実行中です';
export const MSG_NOT_LOGGED_IN = 'gh にログインしていません。`gh auth login` を実行してください';
export const MSG_NO_AUTO_MERGE = 'リポジトリ設定で自動マージが無効です';
export const MSG_PR_OK = 'PRを作りました。CIが緑になると自動で公開されます';

const ID_RE = /^[A-Za-z0-9_-]+$/;

// ---- 3方向マージ（純粋関数） ----
function canon(v) {
  if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`;
  if (v !== null && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(',')}}`;
  return v === undefined ? 'undefined' : JSON.stringify(v);
}
export const same = (a, b) => canon(a) === canon(b);
const brief = (v) => { const s = v === undefined ? '（なし）' : JSON.stringify(v); return s.length > 160 ? `${s.slice(0, 160)}…` : s; };

// 1項目の3方向比較。main==base→drafts／drafts==base または drafts==main→main／それ以外は衝突。
export function pick3(b, m, d) {
  if (same(m, b)) return { kind: same(d, b) ? 'same' : 'drafts', value: d };
  if (same(d, b) || same(d, m)) return { kind: 'main', value: m };
  return { kind: 'conflict', value: m };
}

// 面1枚（JSON）のマージ。kind: same|drafts（採用）|main（main のまま）|conflict
export function mergeFace(base, main, drafts) {
  const r = pick3(base ?? undefined, main ?? undefined, drafts);
  return { kind: r.kind, take: r.kind === 'drafts' && !same(drafts, main ?? undefined) };
}

const KNOWN_TOP = new Set(['tracks', 'longTrialIds']);
const KNOWN_TRACK = new Set(['trackId', 'title', 'units']);
const KNOWN_UNIT = new Set(['unitId', 'title', 'icon', 'color', 'gimmicks', 'lessonIds', 'practiceIds', 'devOnlyIds']);
const LIST_UNIT = new Set(['lessonIds', 'practiceIds', 'devOnlyIds']);
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function sameSet(a, b) {
  const x = new Set(a || []);
  const y = new Set(b || []);
  return x.size === y.size && [...x].every((v) => y.has(v));
}

// index.json のマージ。{ merged, conflicts:[{file,item,base,main,drafts}], items:[{category,label,before,after}] }
export function mergeIndex(base, main, drafts) {
  const b = base || {};
  const conflicts = [];
  const items = [];
  const file = 'index.json';
  // 1項目：衝突なら main を使い conflicts へ。main と違う結果なら items へ。
  const item = (label, categoryOf, bv, mv, dv, unknownKey = false) => {
    const r = pick3(bv, mv, dv);
    if (r.kind === 'conflict' || (unknownKey && r.kind === 'drafts')) {
      conflicts.push({ file, item: unknownKey && r.kind !== 'conflict' ? `${label}（未知のキー）` : label, base: brief(bv), main: brief(mv), drafts: brief(dv) });
      return mv;
    }
    if (!same(r.value, mv)) items.push({ category: typeof categoryOf === 'function' ? categoryOf(mv, r.value) : categoryOf, label, before: mv, after: r.value });
    return r.value;
  };
  const listCat = (setCat) => (x, y) => (sameSet(x, y) ? '並び' : setCat);

  const out = {};
  const topKeys = [...new Set([...Object.keys(main), ...Object.keys(drafts), ...Object.keys(b)])];
  const trackOf = (idx) => new Map((Array.isArray(idx.tracks) ? idx.tracks : []).map((t) => [t.trackId, t]));
  const tb = trackOf(b);
  const tm = trackOf(main);
  const td = trackOf(drafts);
  const unitMap = (m) => { const r = new Map(); for (const t of m.values()) for (const u of t.units || []) if (isObj(u)) r.set(u.unitId, u); return r; };
  const ub = unitMap(tb);
  const um = unitMap(tm);
  const ud = unitMap(td);

  const trackOrder = item('大項目の並び・追加削除', listCat('大項目'), [...tb.keys()], [...tm.keys()], [...td.keys()]);
  const seenUnits = new Map();
  const tracks = [];
  for (const trackId of trackOrder) {
    const a = tb.get(trackId); const m = tm.get(trackId); const d = td.get(trackId);
    const t = { trackId };
    const title = item(`大項目 ${trackId} の名前`, '大項目', a?.title, m?.title, d?.title);
    if (title !== undefined) t.title = title;
    const extras = new Set([...Object.keys(a || {}), ...Object.keys(m || {}), ...Object.keys(d || {})].filter((k) => !KNOWN_TRACK.has(k)));
    for (const k of extras) {
      const v = item(`大項目 ${trackId} の ${k}`, 'その他', a?.[k], m?.[k], d?.[k], true);
      if (v !== undefined) t[k] = v;
    }
    const unitIds = item(`大項目 ${trackId} の単元（追加・削除・並び）`, listCat('大項目'), (a?.units || []).map((u) => u.unitId), (m?.units || []).map((u) => u.unitId), (d?.units || []).map((u) => u.unitId));
    t.units = [];
    for (const unitId of unitIds) {
      if (seenUnits.has(unitId)) { conflicts.push({ file, item: `単元 ${unitId} が大項目 ${seenUnits.get(unitId)} と ${trackId} の両方に出ます`, base: brief(ub.get(unitId)), main: brief(um.get(unitId)), drafts: brief(ud.get(unitId)) }); continue; }
      seenUnits.set(unitId, trackId);
      const x = ub.get(unitId); const y = um.get(unitId); const z = ud.get(unitId);
      const keys = [...new Set([...Object.keys(y || {}), ...Object.keys(z || {}), ...Object.keys(x || {})])];
      const u = {};
      for (const k of keys) {
        const known = KNOWN_UNIT.has(k);
        const cat = k === 'title' ? '単元名' : (k === 'icon' || k === 'color') ? 'アイコン・色' : LIST_UNIT.has(k) ? listCat('公開／非公開') : 'その他';
        const v = k === 'unitId' ? unitId : item(`単元 ${unitId} の ${k}`, cat, x?.[k], y?.[k], z?.[k], !known);
        if (v !== undefined) u[k] = v;
      }
      t.units.push(u);
    }
    tracks.push(t);
  }
  for (const k of topKeys) {
    if (k === 'tracks') { out.tracks = tracks; continue; }
    const v = item(k === 'longTrialIds' ? 'longTrialIds' : `トップの ${k}`, 'その他', b[k], main[k], drafts[k], !KNOWN_TOP.has(k));
    if (v !== undefined) out[k] = v;
  }
  if (!('tracks' in out)) out.tracks = tracks;
  return { merged: out, conflicts, items };
}

// ---- 実行（git・gh） ----
export function defaultRun(cmd, args, { cwd, timeout = 120_000 } = {}) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { cwd, windowsHide: true, timeout, maxBuffer: 64 * 1024 * 1024 }, (err, stdout, stderr) => (err ? reject(Object.assign(err, { stdout, stderr })) : resolve({ stdout, stderr })));
  });
}

const tail = (e) => String((e && (e.stderr || e.stdout || e.message)) || e).trim().split('\n').slice(-12).join('\n');
const pad = (n) => String(n).padStart(2, '0');
export function stampOf(d = new Date()) {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

async function readJsonOrNull(file) {
  try { return { raw: await fs.promises.readFile(file, 'utf8') }; } catch (e) { if (e.code === 'ENOENT') return null; throw e; }
}

export function createPublisher({ pubDir, root, run = defaultRun, now = () => new Date() }) {
  const state = { running: false, stage: '', log: [], done: false, ok: false, url: '', error: null };
  const note = (s) => { state.stage = s; state.log.push(s); };
  const git = (args, cwd = root, timeout) => run('git', args, { cwd, timeout });
  const show = async (ref, name) => {
    try { const { stdout } = await git(['show', `${ref}:lessons/${name}`]); return { raw: stdout, data: JSON.parse(stdout) }; } catch { return null; }
  };

  async function listDraftFaces() {
    try { return (await fs.promises.readdir(path.join(pubDir, 'lessons'))).filter((f) => f.endsWith('.json') && ID_RE.test(f.slice(0, -5))).map((f) => f.slice(0, -5)).sort(); } catch { return []; }
  }

  // 差分と公開内容を作る（何も書かない）。
  async function plan() {
    const pv = { base: null, baseMissing: false, baseGone: false, conflicts: [], changes: [], faces: [], messages: [], publishable: false, empty: false };
    const writes = { faces: [], index: null, snapshot: [] };
    const faceIds = await listDraftFaces();
    const dIndex = await readJsonOrNull(path.join(pubDir, 'index.json'));
    if (faceIds.length === 0 && !dIndex) { pv.empty = true; pv.messages.push(MSG_NO_CHANGE); return { pv, writes }; }
    const bf = await readJsonOrNull(path.join(pubDir, 'base.json'));
    let base = null;
    try { base = bf ? JSON.parse(bf.raw).base : null; } catch { base = null; }
    if (typeof base !== 'string' || !/^[0-9a-f]{7,40}$/i.test(base)) { pv.baseMissing = true; pv.messages.push(MSG_BASE_MISSING); return { pv, writes }; }
    pv.base = base;
    try { await git(['fetch', 'origin', 'main'], root, 60_000); } catch { /* 取れなくても手元の origin/main で比べる */ }
    try { await git(['merge-base', '--is-ancestor', base, 'origin/main']); } catch { pv.baseGone = true; pv.messages.push(MSG_BASE_GONE); return { pv, writes }; }

    for (const id of faceIds) {
      const d = await readJsonOrNull(path.join(pubDir, 'lessons', `${id}.json`));
      let dd; try { dd = JSON.parse(d.raw); } catch { pv.conflicts.push({ file: `${id}.json`, item: '面', base: '', main: '', drafts: '（仮保存が JSON として読めません）' }); continue; }
      const bb = await show(base, `${id}.json`);
      const mm = await show('origin/main', `${id}.json`);
      const r = mergeFace(bb?.data, mm?.data, dd);
      writes.snapshot.push({ file: path.join(pubDir, 'lessons', `${id}.json`), raw: d.raw });
      if (r.kind === 'conflict') pv.conflicts.push({ file: `${id}.json`, item: '面', base: brief(bb?.data), main: brief(mm?.data), drafts: brief(dd) });
      else if (r.take) { pv.faces.push(id); writes.faces.push({ id, raw: d.raw }); }
    }
    if (dIndex) {
      let dd; try { dd = JSON.parse(dIndex.raw); } catch { dd = null; }
      const bb = await show(base, 'index.json');
      const mm = await show('origin/main', 'index.json');
      writes.snapshot.push({ file: path.join(pubDir, 'index.json'), raw: dIndex.raw });
      if (!dd || !isObj(dd)) pv.conflicts.push({ file: 'index.json', item: '仮保存', base: '', main: '', drafts: '（JSON として読めません）' });
      else if (!mm) pv.messages.push('origin/main の lessons/index.json が読めません');
      else {
        const r = mergeIndex(bb?.data, mm.data, dd);
        pv.conflicts.push(...r.conflicts);
        if (r.conflicts.length === 0 && !same(r.merged, mm.data)) {
          pv.changes = r.items;
          writes.index = { merged: r.merged, mainRaw: mm.raw };
        }
      }
    }
    if (bf) writes.snapshot.push({ file: path.join(pubDir, 'base.json'), raw: bf.raw });
    if (pv.conflicts.length > 0) pv.messages.unshift(MSG_CONFLICT);
    pv.empty = pv.conflicts.length === 0 && pv.messages.length === 0 && pv.faces.length === 0 && !writes.index;
    if (pv.empty) pv.messages.push(MSG_NO_CHANGE);
    pv.publishable = pv.conflicts.length === 0 && pv.messages.length === 0 && !pv.empty;
    return { pv, writes };
  }

  async function preview() { return (await plan()).pv; }

  async function publishJob() {
    let stage = '';
    const step = (s) => { stage = s; note(s); };
    const fail = (msg) => Object.assign(new Error(msg), { stage });
    let wt = null;
    try {
      step('前提の確認');
      try { await run('gh', ['auth', 'status'], { cwd: root }); } catch { throw fail(MSG_NOT_LOGGED_IN); }
      let am = '';
      try { am = (await run('gh', ['api', 'repos/{owner}/{repo}', '-q', '.allow_auto_merge'], { cwd: root })).stdout.trim(); } catch (e) { throw fail(`自動マージ設定を確認できませんでした（${tail(e)}）`); }
      if (am !== 'true') throw fail(MSG_NO_AUTO_MERGE);

      step('差分の確認');
      const { pv, writes } = await plan();
      if (!pv.publishable) throw fail(pv.messages.join(' / ') || MSG_NO_CHANGE);

      const stamp = stampOf(now());
      const branch = `editor/publish-${stamp}`;
      wt = path.join(root, '.worktrees', `editor-publish-${stamp}`);
      step('worktree の作成');
      try { await git(['worktree', 'add', wt, '-b', branch, 'origin/main']); } catch (e) { wt = null; throw fail(`worktree を作れませんでした（${tail(e)}）`); }
      const keep = wt;

      step('node_modules のリンク');
      try {
        const src = path.join(root, 'node_modules');
        if (process.platform === 'win32') await run('cmd', ['/c', 'mklink', '/J', path.join(keep, 'node_modules'), src], { cwd: root });
        else await run('ln', ['-s', src, path.join(keep, 'node_modules')], { cwd: root });
      } catch (e) { throw fail(`node_modules のリンクに失敗しました（${tail(e)}）`); }

      step('lessons/ へ書き込み');
      for (const f of writes.faces) await fs.promises.writeFile(path.join(keep, 'lessons', `${f.id}.json`), f.raw, 'utf8');
      if (writes.index) {
        const out = `${formatLesson(writes.index.merged)}\n`;
        await fs.promises.writeFile(path.join(keep, 'lessons', 'index.json'), writes.index.mainRaw.includes('\r\n') ? out.replace(/\n/g, '\r\n') : out, 'utf8');
      }

      step('変更範囲の確認');
      const st = (await git(['status', '--porcelain'], keep)).stdout.split('\n').filter(Boolean);
      const bad = st.filter((l) => !l.slice(3).replace(/^"/, '').startsWith('lessons/'));
      if (bad.length > 0) throw fail(`lessons/ 以外が変わっています（${bad.join(', ')}）`);

      const npm = (script) => (process.platform === 'win32' ? run('cmd', ['/c', 'npm', 'run', script], { cwd: keep, timeout: 420_000 }) : run('npm', ['run', script], { cwd: keep, timeout: 420_000 }));
      step('validate:lessons'); try { await npm('validate:lessons'); } catch (e) { throw fail(tail(e)); }
      step('verify:fast'); try { await npm('verify:fast'); } catch (e) { throw fail(tail(e)); }

      step('commit');
      let name = 'editor-publish';
      let email = 'editor-publish@users.noreply.github.com';
      try { const n = (await git(['config', 'user.name'], keep)).stdout.trim(); if (n) name = n; } catch { /* 既定名 */ }
      try { const m = (await git(['config', 'user.email'], keep)).stdout.trim(); if (/noreply\.github\.com$/.test(m)) email = m; } catch { /* 既定 */ }
      try {
        await git(['add', '--', 'lessons'], keep);
        await git(['-c', `user.name=${name}`, '-c', `user.email=${email}`, 'commit', '-m', `feat: エディタから lessons を公開（${branch}）`], keep);
      } catch (e) { throw fail(tail(e)); }

      step('push');
      try { await git(['push', '-u', 'origin', branch], keep, 120_000); } catch (e) { throw fail(tail(e)); }

      step('PR作成');
      let url = '';
      try {
        const body = `エディタの「公開」ボタンによる lessons/ の変更です。面 ${writes.faces.length} 件${writes.index ? '、index.json' : ''}。`;
        const r = await run('gh', ['pr', 'create', '--base', 'main', '--head', branch, '--title', `feat: エディタから lessons を公開（${stamp}）`, '--body', body], { cwd: keep });
        url = r.stdout.trim().split('\n').pop().trim();
      } catch (e) { throw fail(tail(e)); }
      step('自動マージの予約');
      try { await run('gh', ['pr', 'merge', url, '--auto', '--squash'], { cwd: keep }); } catch (e) { state.url = url; throw fail(tail(e)); }

      // 仮保存を消す（公開中に書き換わったファイルは残す）。残りが無ければ base.json も消す。
      let remain = 0;
      for (const s of writes.snapshot) {
        if (path.basename(s.file) === 'base.json') continue;
        const cur = await readJsonOrNull(s.file);
        if (cur && cur.raw === s.raw) await fs.promises.rm(s.file, { force: true }); else if (cur) remain++;
      }
      const left = await listDraftFaces();
      if (remain === 0 && left.length === 0 && !(await readJsonOrNull(path.join(pubDir, 'index.json')))) await fs.promises.rm(path.join(pubDir, 'base.json'), { force: true });
      state.url = url;
      state.ok = true;
      note(MSG_PR_OK);
    } catch (e) {
      state.ok = false;
      state.error = { stage: e.stage || stage, message: e.message, summary: `${e.stage || stage}で止まりました（仮保存は残っています）` };
      note(state.error.summary);
    }
  }

  function start() {
    if (state.running) return false;
    Object.assign(state, { running: true, stage: '', log: [], done: false, ok: false, url: '', error: null });
    publishJob().finally(() => { state.running = false; state.done = true; });
    return true;
  }

  const status = () => ({ running: state.running, done: state.done, ok: state.ok, stage: state.stage, log: [...state.log], url: state.url, error: state.error });

  return { preview, start, status, isRunning: () => state.running };
}
