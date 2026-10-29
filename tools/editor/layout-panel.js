// 配置パネル（#618 段1）。GET/PUT /api/index で lessons/index.json を読み書きする。編集は layout-state.js の純関数。
import { canSetDevOnly, canMoveLesson, canMoveLessonToUnit, setDevOnly, moveLesson, moveLessonToUnit, isLayoutDirty } from './layout-state.js';

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

export function renderLayout() {
  const body = $('layout-body');
  body.replaceChildren();
  for (const t of current.tracks) {
    const th = document.createElement('div');
    th.className = 'lay-track';
    th.textContent = t.title;
    body.append(th);
    for (const u of t.units) {
      const uh = document.createElement('div');
      uh.className = 'lay-unit';
      uh.dataset.unitId = u.unitId;
      uh.textContent = u.title;
      body.append(uh);
      for (const kind of ['lessonIds', 'practiceIds', 'devOnlyIds']) for (const id of u[kind] || []) body.append(renderRow(id, u.unitId, kind));
    }
  }
  $('layout-save').disabled = saving || !dirty();
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
