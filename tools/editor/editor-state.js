// 盤面エディタの状態管理（DOM 非依存。test/editor-state.test.mjs で検査）。
// 開発者用・手元専用。子ども向け画面（APP_SHELL）には載せない。
// 状態 { spec, history: spec[], cursor, cellPx }。spec は既存の盤面 JSON 全体を形を変えずに持つ。
// 元に戻すはスナップショット方式。各関数は state を直接更新し、{ ok: true } か { ok: false, reason } を返す（拒否時は state を変えない）。
import { EDITOR_MAX_SIZE, CELL_PX_MIN, CELL_PX_MAX, CELL_PX_DEFAULT } from './editor-view.js';

export const HISTORY_MAX = 100; // 超えたら先頭（古いもの）から捨てる

// 1マスの単純な要素（盤面 JSON 側の配列名）。置く・消す・動かすができる。
export const SIMPLE_LISTS = ['walls', 'items', 'ice', 'cushion', 'water'];
// 組・周期・方向などの設定が要る要素。段4では置けない（#404 E6）。
export const COMPLEX_KEYS = ['keys', 'switches', 'paint', 'periodic'];
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
export function place(state, key, x, y) {
  const spec = state.spec;
  const isSimple = key === 'wall' || SIMPLE_LISTS.includes(key);
  if (!isSimple && !SINGLE.includes(key)) {
    return ng(COMPLEX_KEYS.includes(key) ? `${key} は組・設定が要るため段4では置けない（#404）` : `${key} は置けない`);
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
  if (here.some((o) => !SIMPLE_LISTS.includes(o.kind))) return ng('組・設定のある要素は段4では消せない（#404）');
  const next = clone(spec);
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
  if (here.length > 1 || !(SINGLE.includes(here[0].kind) || SIMPLE_LISTS.includes(here[0].kind))) return ng('組・設定のある要素は段4では動かせない（#404）');
  if (occupants(spec, toX, toY).length) return ng('移動先に要素がある');
  const next = clone(spec);
  const o = here[0];
  const target = SINGLE.includes(o.kind) ? next[o.kind] : next[o.kind][o.index];
  target.x = toX;
  target.y = toY;
  return commit(state, next);
}
