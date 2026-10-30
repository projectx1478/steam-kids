// 配置パネル（#618 段1・段2）。GET/PUT /api/index で lessons/index.json を読み書きする。編集は layout-state.js の純関数。
import { canSetDevOnly, canMoveLesson, canMoveLessonToUnit, setDevOnly, moveLesson, moveLessonToUnit, isLayoutDirty,
  checkNewId, addUnit, removeUnit, renameUnit, addTrack, removeTrack, renameTrack, canRemoveUnit, canRemoveTrack, layoutProblems } from './layout-state.js';

const $ = (id) => document.getElementById(id);
const KIND_LABEL = { lessonIds: '公開', practiceIds: 'れんしゅう', devOnlyIds: '開発者だけ' };

let saved = null; // 最後に読んだ／保存した index
let current = null; // 編集中の index
let titles = new Map(); // lessonId → レッスンの題名
let saving = false;

const dirty = () => saved !== null && isLayoutDirty(saved, current);

function button(text, onClick, disabled) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'btn sm';
  b.textContent = text;
  b.disabled = disabled;
  b.addEventListener('click', onClick);
  return b;
}

function edit(fn) {
  current = fn(current);
  renderLayout();
}

function renderRow(id, unitId, kind) {
  const row = document.createElement('div');
  row.className = `lay-row${kind === 'devOnlyIds' ? ' dev' : ''}`;
  row.dataset.lessonId = id;
  const nm = document.createElement('span');
  nm.className = 'nm';
  nm.textContent = titles.has(id) ? `${titles.get(id)}（${id}）` : id;
  const tag = document.createElement('span');
  tag.className = 'kind';
  tag.textContent = KIND_LABEL[kind];
  row.append(nm, tag);
  row.append(button('↑', () => edit((i) => moveLesson(i, id, -1)), saving || !canMoveLesson(current, id, -1)));
  row.append(button('↓', () => edit((i) => moveLesson(i, id, 1)), saving || !canMoveLesson(current, id, 1)));
  if (kind !== 'practiceIds') {
    const on = kind === 'lessonIds';
    const t = button(on ? '開発者だけにする' : '公開にする', () => edit((i) => setDevOnly(i, id, on)), saving || !canSetDevOnly(current, id, on));
    t.className += ' lay-toggle';
    row.append(t);
  }
  const sel = document.createElement('select');
  sel.className = 'lay-move';
  sel.disabled = saving;
  sel.append(new Option('ほかの単元へ…', ''));
  for (const t of current.tracks) for (const u of t.units) if (canMoveLessonToUnit(current, id, u.unitId)) sel.append(new Option(u.title, u.unitId));
  sel.addEventListener('change', () => { if (sel.value) edit((i) => moveLessonToUnit(i, id, sel.value)); });
  row.append(sel);
  return row;
}

// 題名の入力欄。変更を確定したとき（change）だけ反映する。空にはできない（元に戻す）。
function titleInput(value, onRename) {
  const inp = document.createElement('input');
  inp.type = 'text';
  inp.className = 'lay-title';
  inp.value = value;
  inp.disabled = saving;
  inp.addEventListener('change', () => {
    if (inp.value.trim() === '') { inp.value = value; return; }
    onRename(inp.value);
  });
  return inp;
}

// ID と題名を入力して追加するフォーム。ID の重複・形の誤りはここで拒否する。
function addForm(label, kind, onAdd) {
  const f = document.createElement('div');
  f.className = `lay-add lay-add-${kind}`;
  const idIn = document.createElement('input');
  idIn.type = 'text';
  idIn.placeholder = 'ID（英小文字）';
  idIn.className = 'lay-add-id';
  const tIn = document.createElement('input');
  tIn.type = 'text';
  tIn.placeholder = '題名';
  tIn.className = 'lay-add-title';
  const err = document.createElement('span');
  err.className = 'lay-add-err';
  const b = button(label, () => {
    const id = idIn.value.trim();
    const msg = checkNewId(current, kind, id) || (tIn.value.trim() === '' ? '題名を入れてください' : '');
    if (msg) { err.textContent = msg; return; }
    onAdd(id, tIn.value.trim());
  }, saving);
  f.append(idIn, tIn, b, err);
  return f;
}

export function renderLayout() {
  const body = $('layout-body');
  body.replaceChildren();
  const problems = layoutProblems(current);
  if (problems.length) {
    const hint = document.createElement('div');
    hint.className = 'lay-hint';
    hint.replaceChildren(...problems.map((m) => { const d = document.createElement('div'); d.textContent = m; return d; }));
    body.append(hint);
  }
  for (const t of current.tracks) {
    const th = document.createElement('div');
    th.className = 'lay-track';
    th.dataset.trackId = t.trackId;
    const tb = button('大項目を削除', () => edit((i) => removeTrack(i, t.trackId)), saving || !canRemoveTrack(current, t.trackId));
    tb.className += ' lay-del-track';
    th.append(titleInput(t.title, (v) => edit((i) => renameTrack(i, t.trackId, v))), tb);
    body.append(th);
    for (const u of t.units) {
      const uh = document.createElement('div');
      uh.className = 'lay-unit';
      uh.dataset.unitId = u.unitId;
      const ub = button('単元を削除', () => edit((i) => removeUnit(i, u.unitId)), saving || !canRemoveUnit(current, u.unitId));
      ub.className += ' lay-del-unit';
      uh.append(titleInput(u.title, (v) => edit((i) => renameUnit(i, u.unitId, v))), ub);
      body.append(uh);
      for (const kind of ['lessonIds', 'practiceIds', 'devOnlyIds']) for (const id of u[kind] || []) body.append(renderRow(id, u.unitId, kind));
    }
    body.append(addForm('単元を追加', 'unit', (id, title) => edit((i) => addUnit(i, t.trackId, id, title))));
  }
  body.append(addForm('大項目を追加', 'track', (id, title) => edit((i) => addTrack(i, id, title))));
  $('layout-save').disabled = saving || !dirty() || problems.length > 0;
}

function showNg(messages, ok = false) {
  const el = $('layout-ng');
  el.className = ok ? 'ok' : '';
  el.replaceChildren(...messages.map((m) => { const d = document.createElement('div'); d.textContent = m; return d; }));
}

export async function saveLayout() {
  if (saving || !dirty()) return;
  saving = true;
  renderLayout();
  try {
    const res = await fetch('/api/index', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(current) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) showNg(body.messages || ['保存できません']);
    else { saved = current; showNg(['保存しました'], true); }
  } catch {
    showNg(['保存できません（サーバーに接続できません）']);
  }
  saving = false;
  renderLayout();
}

export async function openLayoutPanel() {
  const panel = $('layout-panel');
  if (!panel.hidden) return; // 開いたまま（二重に開かない・再読込もしない）
  $('layout-msg').textContent = '';
  try {
    const res = await fetch('/api/index');
    if (!res.ok) throw new Error('read');
    saved = await res.json();
    if (!Array.isArray(saved.tracks)) throw new Error('shape');
    try {
      const ls = await (await fetch('/api/lessons')).json();
      titles = new Map(ls.map((l) => [l.lessonId, l.title]));
    } catch { titles = new Map(); }
  } catch {
    $('layout-msg').textContent = '配置を読めません';
    return;
  }
  current = saved;
  showNg([]);
  panel.hidden = false;
  renderLayout();
}

export function closeLayoutPanel() {
  if (dirty() && !window.confirm('保存していない配置の変更があります。捨てて閉じますか？')) return;
  $('layout-panel').hidden = true;
}

$('layout-save').addEventListener('click', saveLayout);
$('layout-close').addEventListener('click', closeLayoutPanel);
