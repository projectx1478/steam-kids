// 盤面エディタの状態管理（DOM 非依存。test/editor-state.test.mjs で検査）。
// 開発者用・手元専用。子ども向け画面（APP_SHELL）には載せない。
// 状態 { spec, history: spec[], cursor, cellPx }。spec は既存の盤面 JSON 全体を形を変えずに持つ。
// 元に戻すはスナップショット方式。各関数は state を直接更新し、{ ok: true } か { ok: false, reason } を返す（拒否時は state を変えない）。
import { EDITOR_MAX_SIZE, CELL_PX_MIN, CELL_PX_MAX, CELL_PX_DEFAULT, switchModeOptions, switchGroupOptions } from './editor-view.js';

export const HISTORY_MAX = 100; // 超えたら先頭（古いもの）から捨てる

// 1マスの単純な要素（盤面 JSON 側の配列名）。置く・消す・動かすができる。
export const SIMPLE_LISTS = ['walls', 'items', 'ice', 'cushion', 'water'];
// 組・周期・方向などの設定が要る要素。まだ置けない（#404 E6）。switches は #404 段A で外した（open/close のみ。group・toggle は段B・C）。
export const COMPLEX_KEYS = ['keys', 'paint', 'periodic'];
export const SWITCH_COLORS = ['red', 'blue'];
const SWITCH_KINDS = ['switches', 'switches.targets'];
const GROUP_WALLS = 'groupWalls'; // 色連動の壁 [{ x, y, group }]（#404 段B）
const SINGLE = ['start', 'goal'];

const clone = (v) => JSON.parse(JSON.stringify(v));
const ok = () => ({ ok: true });
const ng = (reason) => ({ ok: false, reason });
const list = (v) => (Array.isArray(v) ? v : []);

export function createState(spec, cellPx = CELL_PX_DEFAULT) {
  const first = clone(spec);
  return { spec: first, history: [clone(first)], cursor: 0, cellPx };
}

// cellPx を設定する。整数のみ・8〜128。丸めずに拒否する（丸めはホイール側の clampCellPx）。
export function setCellPx(state, value) {
  if (!Number.isInteger(value)) return ng('マス大きさは整数のみ');
  if (value < CELL_PX_MIN || value > CELL_PX_MAX) return ng(`マス大きさは ${CELL_PX_MIN}〜${CELL_PX_MAX}`);
  state.cellPx = value;
  return ok();
}

// next を新しい編集として積む。cursor より後ろは破棄。100 を超えたら先頭を捨てる。
function commit(state, next) {
  state.history.length = state.cursor + 1;
  state.history.push(clone(next));
  if (state.history.length > HISTORY_MAX) state.history.shift();
  state.cursor = state.history.length - 1;
  state.spec = clone(next);
  return ok();
}

export function canUndo(state) { return state.cursor > 0; }
export function canRedo(state) { return state.cursor < state.history.length - 1; }

export function undo(state) {
  if (!canUndo(state)) return ng('これ以上戻せない');
  state.cursor -= 1;
  state.spec = clone(state.history[state.cursor]);
  return ok();
}

export function redo(state) {
  if (!canRedo(state)) return ng('これ以上やり直せない');
  state.cursor += 1;
  state.spec = clone(state.history[state.cursor]);
  return ok();
}

function inGrid(spec, x, y) {
  return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < spec.grid.cols && y < spec.grid.rows;
}

// そのマスにある要素の一覧 [{ kind, index }]。start・goal は index なし。
// x,y を持つ要素の配列は何でも拾う（keys・doors・switches・bridge など複雑な要素と、switches の targets も含む）。
export function occupants(spec, x, y) {
  const out = [];
  for (const k of SINGLE) if (spec[k] && spec[k].x === x && spec[k].y === y) out.push({ kind: k });
  for (const [kind, v] of Object.entries(spec)) {
    if (!Array.isArray(v)) continue;
    v.forEach((c, index) => {
      if (c && c.x === x && c.y === y) out.push({ kind, index });
      for (const t of list(c && c.targets)) if (t && t.x === x && t.y === y) out.push({ kind: `${kind}.targets`, index });
    });
  }
  return out;
}

// 判定結果の世代番号。判定を送る直前に nextGeneration で番号を取り、返ってきた結果は shouldApplyResult が真のときだけ表示する
// （後から送った判定があれば、古い結果は捨てる）。
export function nextGeneration(state) {
  state.generation = (state.generation || 0) + 1;
  return state.generation;
}

export function shouldApplyResult(state, generation) {
  return generation === (state.generation || 0);
}

// 盤面サイズを変える。EDITOR_MAX_SIZE 超過・1 未満・非整数、要素が盤外になる場合は拒否。
export function setGrid(state, cols, rows) {
  if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 1 || rows < 1) return ng('盤面サイズは1以上の整数');
  if (cols > EDITOR_MAX_SIZE || rows > EDITOR_MAX_SIZE) return ng(`盤面サイズの上限は ${EDITOR_MAX_SIZE}×${EDITOR_MAX_SIZE}`);
  const next = clone(state.spec);
  next.grid = { cols, rows };
  for (let y = 0; y < Math.max(state.spec.grid.rows, rows); y++) {
    for (let x = 0; x < Math.max(state.spec.grid.cols, cols); x++) {
      if ((x >= cols || y >= rows) && occupants(next, x, y).length) return ng('盤外になるマスに要素がある');
    }
  }
  return commit(state, next);
}

// key（palette の key）の要素を (x,y) に置く。同じマスに何かあれば拒否（同じ要素の重なり禁止。他の要素との重なりも盤面 JSON の規則に反するため拒否）。
// start・goal は各1個なので、置くと今の位置から移る。
// groupWalls だけは第5引数 group（その group のスイッチが要る）。
export function place(state, key, x, y, group) {
  const spec = state.spec;
  if (key === 'switches') return placeSwitch(state, x, y);
  if (key === GROUP_WALLS) return placeGroupWall(state, group, x, y);
  const isSimple = key === 'wall' || SIMPLE_LISTS.includes(key);
  if (!isSimple && !SINGLE.includes(key)) {
    return ng(COMPLEX_KEYS.includes(key) ? `${key} は組・設定が要るためまだ置けない（#404）` : `${key} は置けない`);
  }
  if (!inGrid(spec, x, y)) return ng('盤外');
  if (occupants(spec, x, y).length) return ng('そのマスには既に要素がある');
  const next = clone(spec);
  if (SINGLE.includes(key)) {
    next[key] = { x, y };
  } else {
    const name = key === 'wall' ? 'walls' : key;
    next[name] = [...list(next[name]), { x, y }];
  }
  return commit(state, next);
}

// (x,y) の単純な要素を消す。start・goal は各1個必須なので消せない。何も無ければ拒否。
export function erase(state, x, y) {
  const spec = state.spec;
  if (!inGrid(spec, x, y)) return ng('盤外');
  const here = occupants(spec, x, y);
  if (here.length === 0) return ng('消す物が無い');
  if (here.some((o) => SINGLE.includes(o.kind))) return ng('スタート・ゴールは消せない（各1個）');
  if (here.some((o) => !SIMPLE_LISTS.includes(o.kind) && !SWITCH_KINDS.includes(o.kind) && o.kind !== GROUP_WALLS)) return ng('組・設定のある要素はまだ消せない（#404）');
  const next = clone(spec);
  if (here.some((o) => o.kind === 'switches')) {
    // スイッチ本体を消す（同じマスの氷は残す）。対象の壁は他に持ち主がいなければ床に戻る。
    const gone = list(next.switches).find((c) => c.x === x && c.y === y);
    next.switches = list(next.switches).filter((c) => !(c.x === x && c.y === y));
    if (next.switches.length === 0) delete next.switches;
    if (gone && typeof gone.group === 'string') dropGroupWalls(next, gone.group); // group の壁は持ち主がいなくなるので床に戻る
    return commit(state, next);
  }
  if (here.every((o) => o.kind === GROUP_WALLS)) {
    next.groupWalls = list(next.groupWalls).filter((w) => !(w.x === x && w.y === y));
    if (next.groupWalls.length === 0) delete next.groupWalls;
    return commit(state, next);
  }
  if (here.every((o) => o.kind === 'switches.targets')) {
    for (const sw of list(next.switches)) sw.targets = list(sw.targets).filter((t) => !(t.x === x && t.y === y));
    return commit(state, next);
  }
  for (const name of SIMPLE_LISTS) {
    const kept = list(next[name]).filter((c) => !(c.x === x && c.y === y));
    if (kept.length === list(next[name]).length) continue;
    if (name === 'walls') next.walls = kept;
    else if (kept.length) next[name] = kept;
    else {
      delete next[name];
      if (name === 'water') { delete next.waterMode; delete next.bridge; }
    }
  }
  return commit(state, next);
}

// (fromX,fromY) の単純な要素（start・goal 含む）を (toX,toY) へ動かす。移動先に要素があれば拒否。
export function move(state, fromX, fromY, toX, toY) {
  const spec = state.spec;
  if (!inGrid(spec, fromX, fromY) || !inGrid(spec, toX, toY)) return ng('盤外');
  const here = occupants(spec, fromX, fromY);
  if (here.length === 0) return ng('動かす物が無い');
  const swHere = here.find((o) => o.kind === 'switches');
  if (swHere) {
    // スイッチ本体（氷の上にいてもよい）。移動先は placeSwitch と同じ規則。
    if (!switchCellFree(spec, toX, toY, spec.switches[swHere.index].mode === 'toggle')) return ng('移動先に要素がある');
    const moved = clone(spec);
    moved.switches[swHere.index].x = toX;
    moved.switches[swHere.index].y = toY;
    return commit(state, moved);
  }
  if (here.every((o) => o.kind === GROUP_WALLS)) {
    if (occupants(spec, toX, toY).length) return ng('移動先に要素がある');
    const moved = clone(spec);
    for (const w of list(moved.groupWalls)) if (w.x === fromX && w.y === fromY) { w.x = toX; w.y = toY; }
    return commit(state, moved);
  }
  if (here.every((o) => o.kind === 'switches.targets')) {
    // 対象の壁（共有していれば持ち主全員の分）。
    if (occupants(spec, toX, toY).length) return ng('移動先に要素がある');
    const moved = clone(spec);
    for (const sw of list(moved.switches)) for (const t of list(sw.targets)) if (t.x === fromX && t.y === fromY) { t.x = toX; t.y = toY; }
    return commit(state, moved);
  }
  if (here.length > 1 || !(SINGLE.includes(here[0].kind) || SIMPLE_LISTS.includes(here[0].kind))) return ng('組・設定のある要素はまだ動かせない（#404）');
  if (occupants(spec, toX, toY).length) return ng('移動先に要素がある');
  const next = clone(spec);
  const o = here[0];
  const target = SINGLE.includes(o.kind) ? next[o.kind] : next[o.kind][o.index];
  target.x = toX;
  target.y = toY;
  return commit(state, next);
}

// ---- スイッチ（open・close。#404 段A）。選ぶスイッチは座標 (sx,sy) で指す（元に戻す・やり直しでも番号がずれない）。----
const findSwitch = (spec, sx, sy) => list(spec.switches).findIndex((c) => c.x === sx && c.y === sy);

// スイッチ本体を置けるマスか。氷の上は可（toggle のときだけ不可）。それ以外の要素があれば不可。
function switchCellFree(spec, x, y, toggle) {
  if (!inGrid(spec, x, y)) return false;
  return occupants(spec, x, y).every((o) => o.kind === 'ice' && !toggle);
}

// スイッチを (x,y) に置く。targets は空（接続待ち）。色は青、mode は先にあるスイッチと同じ（併用禁止に当たらないように）。
function placeSwitch(state, x, y) {
  const spec = state.spec;
  if (!inGrid(spec, x, y)) return ng('盤外');
  const mode = list(spec.switches)[0] && list(spec.switches)[0].mode;
  if (!switchCellFree(spec, x, y, mode === 'toggle')) return ng('そのマスには既に要素がある');
  const next = clone(spec);
  const sw = { x, y, color: 'blue', targets: [] };
  if (mode !== undefined && mode !== 'open') sw.mode = mode;
  next.switches = [...list(next.switches), sw];
  return commit(state, next);
}

// (sx,sy) のスイッチの対象に (x,y) の壁をトグルする（あれば外し、無ければ足す）。1回＝1手。
// 足せるのは、空きマス、または open 同士で共有する壁（最大2スイッチ。AND 壁）。
export function toggleTarget(state, sx, sy, x, y) {
  const spec = state.spec;
  const i = findSwitch(spec, sx, sy);
  if (i < 0) return ng('スイッチが選ばれていない');
  const sw = spec.switches[i];
  if (!inGrid(spec, x, y)) return ng('盤外');
  const here = occupants(spec, x, y);
  const next = clone(spec);
  if (typeof sw.group === 'string') {
    // group のスイッチ：対象は同じ group の groupWalls で決まる。あれば外し、無ければ足す。
    if (here.some((o) => o.kind === GROUP_WALLS && spec.groupWalls[o.index].group === sw.group)) {
      next.groupWalls = list(next.groupWalls).filter((w) => !(w.x === x && w.y === y));
      if (next.groupWalls.length === 0) delete next.groupWalls;
      return commit(state, next);
    }
    return placeGroupWall(state, sw.group, x, y);
  }
  if (here.some((o) => o.kind === 'switches.targets' && o.index === i)) {
    next.switches[i].targets = list(next.switches[i].targets).filter((t) => !(t.x === x && t.y === y));
    return commit(state, next);
  }
  if (here.some((o) => !SWITCH_KINDS.includes(o.kind) || o.kind === 'switches')) return ng('そのマスには既に要素がある');
  if (here.length > 0) {
    const owners = here.map((o) => spec.switches[o.index]);
    if ((sw.mode ?? 'open') !== 'open' || owners.some((o) => (o.mode ?? 'open') !== 'open')) return ng('壁を共有できるのは open のスイッチ同士だけ');
    if (owners.length >= 2) return ng('1つの壁につなげるスイッチは最大2つ');
  }
  next.switches[i].targets = [...list(next.switches[i].targets), { x, y }];
  return commit(state, next);
}

// group の壁を (x,y) に置く。その group のスイッチが要る。空きマスのみ（validate: 壁・他のギミック・スイッチ・その対象・他の groupWalls と重ならない）。
function placeGroupWall(state, group, x, y) {
  const spec = state.spec;
  if (typeof group !== 'string' || !list(spec.switches).some((c) => c.group === group)) return ng('その group のスイッチが無い');
  if (!inGrid(spec, x, y)) return ng('盤外');
  if (occupants(spec, x, y).length) return ng('そのマスには既に要素がある');
  const next = clone(spec);
  next.groupWalls = [...list(next.groupWalls), { x, y, group }];
  return commit(state, next);
}

function dropGroupWalls(spec, group) {
  spec.groupWalls = list(spec.groupWalls).filter((w) => w.group !== group);
  if (spec.groupWalls.length === 0) delete spec.groupWalls;
}

// group を選ぶ（'' か null は「なし」）。グレーの選択肢（switchGroupOptions の disabled）は選べない＝close・toggle と targets のある間は併用不可、同じ group は1スイッチだけ。
// 「なし」に戻すと、その group の壁は床に戻り、スイッチは接続待ち（targets 空）になる。別の group へ変えると壁も付いていく。
export function setSwitchGroup(state, sx, sy, group) {
  const i = findSwitch(state.spec, sx, sy);
  if (i < 0) return ng('スイッチが選ばれていない');
  const name = group === null || group === undefined ? '' : group;
  const opt = switchGroupOptions(state.spec, i).find((o) => o.value === name);
  if (!opt) return ng('その group は選べない');
  if (opt.disabled) return ng(opt.reason);
  const next = clone(state.spec);
  const sw = next.switches[i];
  const old = typeof sw.group === 'string' ? sw.group : '';
  if (old === name) return ok();
  if (name === '') {
    delete sw.group;
    sw.targets = [];
    dropGroupWalls(next, old);
  } else {
    sw.group = name;
    delete sw.targets;
    if (sw.color === undefined) sw.color = 'blue';
    if (old) for (const w of list(next.groupWalls)) if (w.group === old) w.group = name;
  }
  return commit(state, next);
}

export function setSwitchColor(state, sx, sy, color) {
  const i = findSwitch(state.spec, sx, sy);
  if (i < 0) return ng('スイッチが選ばれていない');
  if (!SWITCH_COLORS.includes(color)) return ng('色は red か blue');
  const next = clone(state.spec);
  next.switches[i].color = color;
  return commit(state, next);
}

// mode は open か close。併用禁止などでグレーの選択肢（switchModeOptions の disabled）は選べない。open は mode を持たない形（既存の盤と同じ）に戻す。
export function setSwitchMode(state, sx, sy, mode) {
  const i = findSwitch(state.spec, sx, sy);
  if (i < 0) return ng('スイッチが選ばれていない');
  const opt = switchModeOptions(state.spec, i).find((o) => o.value === mode);
  if (!opt) return ng('mode は open・close・toggle');
  if (opt.disabled) return ng(opt.reason);
  const next = clone(state.spec);
  if (mode === 'open') delete next.switches[i].mode;
  else next.switches[i].mode = mode;
  // initial は toggle の対象だけで有効（validate）。toggle を外すと消す。
  if (mode !== 'toggle') for (const t of list(next.switches[i].targets)) delete t.initial;
  return commit(state, next);
}

// toggle のスイッチの対象 (tx,ty) の初期状態。'closed'（壁が立っている。既定なので initial は持たない）か 'open'（床）。
export function setTargetInitial(state, sx, sy, tx, ty, initial) {
  const i = findSwitch(state.spec, sx, sy);
  if (i < 0) return ng('スイッチが選ばれていない');
  if (state.spec.switches[i].mode !== 'toggle') return ng('initial は toggle のスイッチだけ');
  if (initial !== 'closed' && initial !== 'open') return ng('initial は closed か open');
  const next = clone(state.spec);
  const t = list(next.switches[i].targets).find((u) => u.x === tx && u.y === ty);
  if (!t) return ng('その壁はつながっていない');
  if (initial === 'open') t.initial = 'open';
  else delete t.initial;
  return commit(state, next);
}

// ---- レッスンの面（steps）の一覧と並べ替え（#402 段2）。盤面の編集履歴（上の state）とは別の { lessonId, steps, selected }。----
// 盤面の編集は state.spec で行い、「置き換え」で選択中の面へ書き戻す。固定は stageGen の面（gen を持つ）から gen を外す。
const META_KEYS = ['stepId', 'kind', 'text', 'solution', 'maxCommands', 'allowedCommands', 'gen', 'shape'];

// keepHandwritten は stageGen のあるレッスンだけ配列（stageGen.keepHandwritten のコピー）。無いレッスンは null。
export function createLessonState(lessonId, steps, keepHandwritten = null) {
  return { lessonId, steps: clone(steps), selected: null, keepHandwritten: Array.isArray(keepHandwritten) ? [...keepHandwritten] : null };
}

export const hasBoard = (step) => !!(step && step.grid && step.start && step.goal);

// 選択中の面を動かした後も同じ面を選び続ける（identity で追う）
function reselect(ls, chosen) {
  const i = chosen ? ls.steps.indexOf(chosen) : -1;
  ls.selected = i >= 0 ? i : null;
}
const inRange = (ls, index) => Number.isInteger(index) && index >= 0 && index < ls.steps.length;

// 面を選ぶ。盤面を持たない面（intro など）は拒否。成功時は編集へ渡す面（コピー）を value で返す。
export function selectStep(ls, index) {
  if (!inRange(ls, index)) return ng('その番号の面は無い');
  if (!hasBoard(ls.steps[index])) return ng('盤面を持たない面は選べない');
  ls.selected = index;
  return { ok: true, value: clone(ls.steps[index]) };
}

// 盤面編集の state を別の盤面で読み直す（履歴は作り直し。cellPx は保つ）
export function loadSpec(state, spec) {
  const first = clone(spec);
  state.spec = first;
  state.history = [clone(first)];
  state.cursor = 0;
  return ok();
}

// 面を delta（-1＝上、+1＝下）だけ動かす。端は拒否。
export function moveStep(ls, index, delta) {
  if (!inRange(ls, index)) return ng('その番号の面は無い');
  const to = index + delta;
  if (delta !== -1 && delta !== 1) return ng('動かせるのは1つずつ');
  if (to < 0 || to >= ls.steps.length) return ng('これ以上動かせない');
  const chosen = ls.selected === null ? null : ls.steps[ls.selected];
  [ls.steps[index], ls.steps[to]] = [ls.steps[to], ls.steps[index]];
  reselect(ls, chosen);
  return ok();
}

// 面を置き換える。spec は編集中の盤面（面の形のまま）。stepId・kind は元の面のまま。
export function replaceStep(ls, index, spec) {
  if (!inRange(ls, index)) return ng('その番号の面は無い');
  if (!hasBoard(spec)) return ng('盤面（grid・start・goal）が無い');
  const old = ls.steps[index];
  const next = clone(spec);
  next.stepId = old.stepId;
  next.kind = old.kind;
  delete next.gen; // 手書きの面にする（gen 付きだと再生成で消える）
  ls.steps[index] = next;
  return ok();
}

export function removeStep(ls, index) {
  if (!inRange(ls, index)) return ng('その番号の面は無い');
  if (ls.steps.length === 1) return ng('最後の1面は消せない');
  const chosen = ls.selected === null ? null : ls.steps[ls.selected];
  ls.steps.splice(index, 1);
  reselect(ls, chosen);
  return ok();
}

// 複製して index の直後に追加する。stepId は重ならない名前（<元>-copy, -copy2 ...）にする。追加した面を選ぶ。
export function duplicateStep(ls, index) {
  if (!inRange(ls, index)) return ng('その番号の面は無い');
  const copy = clone(ls.steps[index]);
  const ids = new Set(ls.steps.map((s) => s.stepId));
  let id = `${copy.stepId}-copy`;
  for (let n = 2; ids.has(id); n++) id = `${copy.stepId}-copy${n}`;
  copy.stepId = id;
  delete copy.gen; // 手書きの面にする（gen 付きだと再生成で消える）
  ls.steps.splice(index + 1, 0, copy);
  ls.selected = index + 1;
  return ok();
}

// 下書き（盤面 JSON）を面として index の直後に追加する（index が null なら末尾）。stepId は重ならない名前（<base>, <base>2 ...）、kind は play。追加した面を選ぶ。
export function addDraftStep(ls, spec, baseId, index = null) {
  if (!hasBoard(spec)) return ng('盤面（grid・start・goal）が無い');
  const at = index === null ? ls.steps.length : index + 1;
  if (!Number.isInteger(at) || at < 0 || at > ls.steps.length) return ng('その番号の面は無い');
  const next = clone(spec);
  const base = String(baseId || next.stepId || 'draft');
  const ids = new Set(ls.steps.map((s) => s.stepId));
  let id = base;
  for (let n = 2; ids.has(id); n++) id = `${base}${n}`;
  next.stepId = id;
  next.kind = 'play';
  delete next.gen;
  ls.steps.splice(at, 0, next);
  ls.selected = at;
  return ok();
}

// 保存 NG の文言を「自分の面（placedIds）が原因か」で分ける。検査名（「検査名: 文言」の頭）・stepId・数値は文言のまま出す。
export function explainSaveNg(messages, placedIds) {
  const own = (m) => placedIds.some((id) => m.includes(`stepId="${id}"`) || m.includes(`"${id}"`));
  return messages.map((m) => ({ message: m, own: own(m), label: own(m) ? '自分の面が原因' : 'ほかの面・レッスン全体が原因の可能性' }));
}

// stageGen の面を固定する。盤面は面に書き出し済みなので、gen を捨てて stageGen.keepHandwritten（先頭の play から連続）に足す。元は git に残る。
export function pinStep(ls, index) {
  if (!inRange(ls, index)) return ng('その番号の面は無い');
  const step = ls.steps[index];
  if (!('gen' in step)) return ng('固定する面ではない（gen が無い）');
  if (Array.isArray(ls.keepHandwritten)) {
    const plays = ls.steps.filter((s) => s.kind === 'play').map((s) => s.stepId);
    if (step.kind !== 'play' || plays[ls.keepHandwritten.length] !== step.stepId) return ng('それより前を全部固定してから固定する（固定は先頭の面から順に）');
    ls.keepHandwritten.push(step.stepId);
  }
  delete step.gen;
  return ok();
}

// 盤面の部分だけを並び順に依らない文字列にする（同盤面の判定用）
function canon(v) {
  if (Array.isArray(v)) return `[${v.map(canon).sort().join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${k}:${canon(v[k])}`).join(',')}}`;
  return JSON.stringify(v);
}

// 同じ盤面の面の組 [[index, ...], ...]（2面以上）。警告だけで保存は止めない。
export function duplicateBoards(steps) {
  const groups = new Map();
  steps.forEach((s, i) => {
    if (!hasBoard(s)) return;
    const board = {};
    for (const [k, v] of Object.entries(s)) if (!META_KEYS.includes(k)) board[k] = v;
    const key = canon(board);
    groups.set(key, [...(groups.get(key) || []), i]);
  });
  return [...groups.values()].filter((g) => g.length > 1);
}
