// 盤面エディタ（開発者用）の画面。盤面は js/ui-board.js の drawBoard 経由で描く。
import { drawBoard } from '/js/ui-board.js';
import { SAMPLE_SPEC, CELL_PX_DEFAULT, EDITOR_MAX_SIZE, ANALYZE_DEBOUNCE_MS, clampCellPx, wheelCellPx, zoomPercent, formatMetrics } from './editor-view.js';

import { GIMMICKS } from '/js/gimmicks/index.js';
import { buildPalette, iconSpec } from './palette.js';
import { createState, setCellPx as setStateCellPx, place, erase, move, undo, redo, canUndo, canRedo, nextGeneration, shouldApplyResult, createLessonState, selectStep, loadSpec, moveStep, replaceStep, removeStep, duplicateStep, pinStep, duplicateBoards, hasBoard, addDraftStep, explainSaveNg } from './editor-state.js';

const state = createState(SAMPLE_SPEC, CELL_PX_DEFAULT);
state.selected = 'wall';
let notice = ''; // 直前の操作の結果（拒否の理由など）
let moveFrom = null; // 「Shift+クリックで選んだ動かす元のマス」

const ICON_CELL_PX = 32;
// 消しゴムは盤面部品に無いので専用の SVG（見本のとおり）
const ERASER_SVG = '<svg viewBox="0 0 64 64" aria-hidden="true"><g transform="rotate(-30 32 32)"><rect x="10" y="22" width="44" height="22" rx="5" fill="#f9a8d4" stroke="#be185d" stroke-width="2.5" /><rect x="10" y="22" width="16" height="22" rx="5" fill="#e2e8f0" stroke="#64748b" stroke-width="2.5" /></g></svg>';

function sepEl(text) {
  const d = document.createElement('div');
  d.className = 'sep';
  d.textContent = text;
  return d;
}

function paletteRow(item) {
  const row = document.createElement('div');
  row.className = 'pi';
  row.dataset.key = item.key;
  const ic = document.createElement('span');
  ic.className = 'ic';
  const spec = iconSpec(item.key);
  if (spec) {
    const holder = document.createElement('span');
    drawBoard({ boardWrap: holder, spec, cellSize: ICON_CELL_PX, playerPos: item.key === 'start' ? spec.start : { x: -1, y: -1 } });
    ic.appendChild(holder.firstChild);
  } else {
    ic.innerHTML = ERASER_SVG;
  }
  const lb = document.createElement('span');
  lb.className = 'lb';
  lb.textContent = item.label;
  const ky = document.createElement('span');
  ky.className = 'ky';
  ky.textContent = item.key;
  row.append(ic, lb, ky);
  row.addEventListener('click', () => selectPalette(item.key));
  return row;
}

function selectPalette(key) {
  state.selected = key;
  moveFrom = null;
  notice = '';
  for (const row of document.querySelectorAll('#plist .pi')) row.classList.toggle('sel', row.dataset.key === key);
  render();
}

function renderPalette() {
  const items = buildPalette(GIMMICKS);
  const plist = document.getElementById('plist');
  plist.append(sepEl('固定'), ...items.filter((p) => p.kind === 'fixed').map(paletteRow));
  plist.append(sepEl('ギミック（GIMMICKS 登録順）'), ...items.filter((p) => p.kind === 'gimmick').map(paletteRow));
  selectPalette(state.selected);
}

const boardWrap = document.getElementById('board');
const boardArea = document.getElementById('boardArea');
const zoomEl = document.getElementById('zoom');
const statusEl = document.getElementById('status');
const undoEl = document.getElementById('undo');
const redoEl = document.getElementById('redo');

function render() {
  drawBoard({ boardWrap, spec: state.spec, cellSize: state.cellPx, playerPos: state.spec.start });
  zoomEl.textContent = `${zoomPercent(state.cellPx)}%`;
  const { cols, rows } = state.spec.grid;
  const sel = buildPalette(GIMMICKS).find((p) => p.key === state.selected);
  const moving = moveFrom ? `　動かす元: (${moveFrom.x},${moveFrom.y}) → 行き先をクリック` : '';
  statusEl.textContent = `${cols}×${rows}（上限 ${EDITOR_MAX_SIZE}×${EDITOR_MAX_SIZE}）　マス ${state.cellPx}px　選択中: ${sel ? sel.label : '—'}${moving}${notice ? `　${notice}` : ''}`;
  if (moveFrom) {
    const cell = boardWrap.querySelector(`.grid-cell[data-x="${moveFrom.x}"][data-y="${moveFrom.y}"]`);
    if (cell) cell.style.outline = '3px solid #7c3aed';
  }
  undoEl.disabled = !canUndo(state);
  redoEl.disabled = !canRedo(state);
}

function setCellPx(value) {
  const next = clampCellPx(value);
  if (next === state.cellPx) return;
  setStateCellPx(state, next);
  render();
}

// 判定（POST /api/analyze）。編集が止まってから約300ms後に送り、世代番号で古い結果を捨てる。ブラウザ保存は使わない。
const metricsEl = document.createElement('div');
metricsEl.id = 'metrics';
statusEl.after(metricsEl);
let analyzeTimer = null;

function showMetrics(lines) {
  metricsEl.replaceChildren(...lines.map((t) => {
    const d = document.createElement('div');
    d.textContent = t;
    return d;
  }));
}

async function analyzeNow() {
  const gen = nextGeneration(state);
  showMetrics(formatMetrics(null));
  let lines;
  try {
    const res = await fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(lesson && lesson.selected !== null ? { spec: state.spec, lessonId: lesson.lessonId, index: lesson.selected } : { spec: state.spec }) });
    const body = await res.json();
    lines = res.ok ? formatMetrics(body) : ['未判定', ...(body.messages || []).map((m) => `! ${m}`)];
  } catch {
    lines = ['未判定（判定サーバーに接続できません）'];
  }
  if (shouldApplyResult(state, gen)) showMetrics(lines);
}

function scheduleAnalyze() {
  clearTimeout(analyzeTimer);
  analyzeTimer = setTimeout(analyzeNow, ANALYZE_DEBOUNCE_MS);
}

// 操作の結果を状態行へ出して描き直す
function apply(result) {
  notice = result.ok ? '' : `できません: ${result.reason}`;
  render();
  if (result.ok) scheduleAnalyze();
}

function doUndo() { apply(undo(state)); }
function doRedo() { apply(redo(state)); }

// マスのクリック。Shift+クリック＝動かす元を選ぶ → 次のクリックが行き先。それ以外はパレットの選択どおり置く／消す。
boardWrap.addEventListener('click', (e) => {
  const cell = e.target.closest('.grid-cell');
  if (!cell) return;
  const x = Number(cell.dataset.x);
  const y = Number(cell.dataset.y);
  if (moveFrom) {
    const from = moveFrom;
    moveFrom = null;
    apply(move(state, from.x, from.y, x, y));
    return;
  }
  if (e.shiftKey) {
    moveFrom = { x, y };
    notice = '';
    render();
    return;
  }
  apply(state.selected === 'eraser' ? erase(state, x, y) : place(state, state.selected, x, y));
});

undoEl.addEventListener('click', doUndo);
redoEl.addEventListener('click', doRedo);
document.addEventListener('keydown', (e) => {
  if (!(e.ctrlKey || e.metaKey)) return;
  const k = e.key.toLowerCase();
  if (k === 'z' && !e.shiftKey) { e.preventDefault(); doUndo(); }
  else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); doRedo(); }
});

boardArea.addEventListener('wheel', (e) => {
  e.preventDefault();
  setCellPx(wheelCellPx(state.cellPx, e.deltaY));
}, { passive: false });

document.getElementById('zoom-reset').addEventListener('click', () => setCellPx(CELL_PX_DEFAULT));

// ---- レッスンの面（読み込み・選択・複製・置き換え・削除・上下・固定・保存）。ブラウザ保存は使わない。----
let lesson = null; // createLessonState の値
let lessonDirty = false;
let placedIds = new Set(); // 下書きの配置・置き換えで触れた面の stepId（保存 NG の「自分の面が原因か」の判定用）
const lessonSelectEl = document.getElementById('lesson-select');
const stepListEl = document.getElementById('step-list');
const stepWarnEl = document.getElementById('step-warn');
const saveNgEl = document.getElementById('save-ng');
const stepBtn = (id) => document.getElementById(id);

function renderSteps() {
  const dups = lesson ? duplicateBoards(lesson.steps) : [];
  const dupIdx = new Set(dups.flat());
  stepListEl.replaceChildren(...(lesson ? lesson.steps : []).map((s, i) => {
    const d = document.createElement('div');
    d.className = `st${lesson.selected === i ? ' sel' : ''}${hasBoard(s) ? '' : ' nob'}`;
    d.dataset.index = String(i);
    const label = document.createElement('span');
    label.textContent = `${i + 1}. ${s.stepId} (${s.kind})`;
    d.append(label);
    const tags = [('gen' in s) ? 'gen' : '', dupIdx.has(i) ? '重複' : ''].filter(Boolean).join(' ');
    if (tags) { const t = document.createElement('span'); t.className = 'tag'; t.textContent = tags; d.append(t); }
    d.addEventListener('click', () => chooseStep(i));
    return d;
  }));
  stepWarnEl.textContent = dups.map((g) => `同じ盤面: ${g.map((i) => lesson.steps[i].stepId).join('・')}（保存は止めない）`).join(' / ');
  const sel = lesson ? lesson.selected : null;
  const has = sel !== null;
  for (const id of ['step-up', 'step-down', 'step-dup', 'step-replace', 'step-pin', 'step-del']) stepBtn(id).disabled = !has;
  stepBtn('step-up').disabled = !has || sel === 0;
  stepBtn('step-down').disabled = !has || sel === lesson.steps.length - 1;
  stepBtn('step-pin').disabled = !has || !('gen' in lesson.steps[sel]);
  stepBtn('lesson-save').disabled = !lesson || !lessonDirty;
  stepBtn('step-add').disabled = !lesson;
}

function lessonResult(result) {
  if (!result.ok) { notice = `できません: ${result.reason}`; } else { notice = ''; lessonDirty = true; }
  renderSteps();
  render();
}

function boardDirty() {
  return lesson && lesson.selected !== null && JSON.stringify(state.spec) !== JSON.stringify(lesson.steps[lesson.selected]);
}

function chooseStep(i) {
  if (boardDirty() && !window.confirm('盤面の編集が置き換えられていません。捨てて別の面を開きますか？')) return;
  const r = selectStep(lesson, i);
  if (r.ok) { loadSpec(state, r.value); moveFrom = null; notice = ''; scheduleAnalyze(); }
  else notice = `できません: ${r.reason}`;
  renderSteps();
  render();
}

async function loadLesson(id) {
  lesson = null;
  lessonDirty = false;
  placedIds = new Set();
  saveNgEl.replaceChildren();
  if (!id) { renderSteps(); return; }
  try {
    const res = await fetch(`/api/lessons/${encodeURIComponent(id)}`);
    const body = await res.json();
    if (!res.ok) { notice = `読めません: ${(body.messages || []).join(' / ')}`; }
    else { lesson = createLessonState(id, body.steps, body.keepHandwritten); notice = ''; }
  } catch { notice = '読めません（サーバーに接続できません）'; }
  renderSteps();
  render();
}

async function loadLessonList() {
  try {
    const res = await fetch('/api/lessons');
    const list = await res.json();
    for (const l of list) {
      const o = document.createElement('option');
      o.value = l.lessonId;
      o.textContent = `${l.lessonId}（${l.stepCount}面）`;
      lessonSelectEl.append(o);
    }
  } catch { notice = 'レッスン一覧を読めません'; render(); }
}

function showSaveNg(items) {
  saveNgEl.replaceChildren(...items.map((it) => {
    const d = document.createElement('div');
    if (it.own) d.className = 'own';
    d.textContent = `[${it.label}] ${it.message}`;
    return d;
  }));
}

async function saveLesson() {
  try {
    const res = await fetch(`/api/lessons/${encodeURIComponent(lesson.lessonId)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(lesson.keepHandwritten ? { steps: lesson.steps, keepHandwritten: lesson.keepHandwritten } : lesson.steps) });
    const body = await res.json();
    if (res.ok) { lessonDirty = false; placedIds = new Set(); notice = '保存しました'; saveNgEl.replaceChildren(); }
    else {
      notice = '保存しません（下の検査結果を見てください）';
      showSaveNg(explainSaveNg(body.messages || [], [...placedIds]));
    }
  } catch { notice = '保存できません（サーバーに接続できません）'; }
  renderSteps();
  render();
}

lessonSelectEl.addEventListener('change', () => {
  if (lessonDirty && !window.confirm('保存していない変更があります。捨てて別のレッスンを開きますか？')) { lessonSelectEl.value = lesson ? lesson.lessonId : ''; return; }
  loadLesson(lessonSelectEl.value);
});
stepBtn('step-up').addEventListener('click', () => lessonResult(moveStep(lesson, lesson.selected, -1)));
stepBtn('step-down').addEventListener('click', () => lessonResult(moveStep(lesson, lesson.selected, 1)));
stepBtn('step-dup').addEventListener('click', () => {
  const r = duplicateStep(lesson, lesson.selected);
  if (r.ok) { loadSpec(state, lesson.steps[lesson.selected]); scheduleAnalyze(); }
  lessonResult(r);
});
stepBtn('step-replace').addEventListener('click', () => {
  const r = replaceStep(lesson, lesson.selected, state.spec);
  if (r.ok) { loadSpec(state, lesson.steps[lesson.selected]); placedIds.add(lesson.steps[lesson.selected].stepId); }
  lessonResult(r);
});
stepBtn('step-pin').addEventListener('click', () => {
  const r = pinStep(lesson, lesson.selected);
  if (r.ok) loadSpec(state, lesson.steps[lesson.selected]);
  lessonResult(r);
});
stepBtn('step-del').addEventListener('click', () => {
  if (!window.confirm('この面を削除しますか？（保存するまでファイルは変わりません）')) return;
  lessonResult(removeStep(lesson, lesson.selected));
});
stepBtn('lesson-save').addEventListener('click', saveLesson);

loadLessonList();
renderPalette();
scheduleAnalyze();

// ---- 下書き（tools/editor/drafts/ へ保存。GET/PUT /api/drafts）。保存時は検査せず、面として置く（置き換え・追加）→ 保存のときに検査される。----
const draftNameEl = document.getElementById('draft-name');
const draftSelectEl = document.getElementById('draft-select');
const draftLoadEl = document.getElementById('draft-load');

async function loadDraftList() {
  try {
    const names = await (await fetch('/api/drafts')).json();
    draftSelectEl.replaceChildren(new Option('下書きを選ぶ', ''), ...names.map((n) => new Option(n, n)));
  } catch { notice = '下書き一覧を読めません'; render(); }
}

async function saveDraft() {
  const name = draftNameEl.value.trim();
  try {
    const res = await fetch(`/api/drafts/${encodeURIComponent(name)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(state.spec) });
    const body = await res.json();
    notice = res.ok ? `下書き ${name} を保存しました` : `下書きを保存できません: ${(body.messages || []).join(' / ')}`;
    if (res.ok) await loadDraftList();
  } catch { notice = '下書きを保存できません（サーバーに接続できません）'; }
  render();
}

async function loadDraft() {
  const name = draftSelectEl.value;
  if (!name) return;
  if (boardDirty() && !window.confirm('盤面の編集が置き換えられていません。捨てて下書きを読み込みますか？')) return;
  try {
    const res = await fetch(`/api/drafts/${encodeURIComponent(name)}`);
    const body = await res.json();
    if (res.ok) { loadSpec(state, body.spec); draftNameEl.value = name; moveFrom = null; notice = `下書き ${name} を読み込みました`; scheduleAnalyze(); }
    else notice = `読めません: ${(body.messages || []).join(' / ')}`;
  } catch { notice = '下書きを読めません（サーバーに接続できません）'; }
  render();
}

draftSelectEl.addEventListener('change', () => { draftLoadEl.disabled = !draftSelectEl.value; });
document.getElementById('draft-save').addEventListener('click', saveDraft);
draftLoadEl.addEventListener('click', loadDraft);
stepBtn('step-add').addEventListener('click', () => {
  const r = addDraftStep(lesson, state.spec, draftNameEl.value.trim() || 'draft', lesson.selected);
  if (r.ok) { placedIds.add(lesson.steps[lesson.selected].stepId); loadSpec(state, lesson.steps[lesson.selected]); scheduleAnalyze(); }
  lessonResult(r);
});
loadDraftList();
