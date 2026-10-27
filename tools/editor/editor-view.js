// 盤面エディタの表示まわりの定数と純粋な関数（DOM 非依存。test/editor-view.test.mjs で検査）。
// 開発者用・手元専用。子ども向け画面（APP_SHELL）には載せない。

export const EDITOR_MAX_SIZE = 20; // 盤面サイズ上限（レッスンJSON の上限検査 1〜20 と同じ。#389）

// cellPx（1マスの px）。renderGrid は cellSize を検査せずそのまま使うので、範囲はエディタ側で決める。
export const CELL_PX_MIN = 8; // js/ui-grid.js の MIN_CELL と同じ
export const CELL_PX_MAX = 128; // 200%。現行の最大 6×6 でも 1280×800 の盤面エリアに収まる（6*128+28=796）。盤面の上限は 20×20（#389）
export const CELL_PX_DEFAULT = 64; // 100%。renderGrid の DEFAULT_CELL と同じ

// 正の整数に丸めて範囲内に収める。数でない値・NaN は既定値。
export function clampCellPx(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return CELL_PX_DEFAULT;
  return Math.min(CELL_PX_MAX, Math.max(CELL_PX_MIN, n));
}

// ホイールの deltaY（上向き＝負＝拡大）から次の cellPx を返す。1回で約10％、最低 1px は動かす。
export function wheelCellPx(current, deltaY) {
  if (!deltaY) return clampCellPx(current);
  const step = Math.max(1, Math.round(current * 0.1));
  return clampCellPx(current + (deltaY < 0 ? step : -step));
}

export function zoomPercent(cellPx) {
  return Math.round((cellPx / CELL_PX_DEFAULT) * 100);
}

export const ANALYZE_DEBOUNCE_MS = 300; // 編集が止まってから判定を送るまで

// 必須を表示するギミック名（POST /api/analyze の matters のキー）
export const MATTER_LABELS = { ice: 'こおり', keys: 'かぎ', items: 'どんぐり', periodic: '周期ドア', paint: 'ぬり', switches: 'スイッチ', warps: 'ワープ', water: '水', cushion: 'クッション' };

// 判定結果（POST /api/analyze の応答）を表示用の文字列の配列にする。result が null＝判定中。
// 打ち切り（status:'timeout'）は「未判定」とし、OK に見せない。
export function formatMetrics(result) {
  if (!result) return ['判定中…'];
  if (result.status === 'timeout') return ['未判定（時間切れ）'];
  const lines = [result.clearable ? 'クリア: できる' : 'クリア: できない'];
  lines.push(`最短手数: ${result.shortest === null || result.shortest === undefined ? '—' : result.shortest}`);
  const matters = result.matters || {};
  for (const [key, label] of Object.entries(MATTER_LABELS)) {
    if (matters[key] === null || matters[key] === undefined) continue;
    lines.push(`${label}の必須: ${matters[key] ? '必須' : '飾り（NG）'}`);
  }
  lines.push(`曲がる回数（一例）: ${result.turns === null || result.turns === undefined ? '—' : result.turns}`);
  const gradient = result.gradient || [];
  if (gradient.length > 0) {
    const chain = gradient.map((g) => `${g.index + 1}面目=${g.shortest}${g.ok ? '' : '（警告）'}`).join(' → ');
    lines.push(`勾配（最短手数）: ${chain}${gradient.some((g) => !g.ok) ? ' ※保存はできます' : ''}`);
  }
  for (const m of result.messages || []) lines.push(`! ${m}`);
  return lines;
}

// 表示用の例盤面（既存の盤面 JSON と同じ形。lessons/*.json の demo・step と同じ項目）。
export const SAMPLE_SPEC = {
  grid: { cols: 5, rows: 5 },
  start: { x: 0, y: 0 },
  goal: { x: 4, y: 4 },
  walls: [{ x: 1, y: 0 }, { x: 1, y: 1 }, { x: 3, y: 3 }],
  items: [{ x: 2, y: 0 }, { x: 4, y: 1 }],
  ice: [{ x: 3, y: 0 }, { x: 4, y: 0 }],
  cushion: [{ x: 3, y: 1 }],
  keys: [{ x: 0, y: 2, color: 'red' }],
  doors: [{ x: 2, y: 2, color: 'red' }],
  keyMode: 'remote',
  switches: [{ x: 0, y: 4, color: 'blue', targets: [{ x: 1, y: 4 }] }],
  paint: [{ x: 0, y: 3 }],
  periodic: [{ x: 4, y: 2, period: 3 }],
  water: [{ x: 2, y: 3 }],
  bridge: [{ x: 2, y: 4 }],
  waterMode: 'bump',
};

// エディタ起動時の空盤面（#512）。5x5・start/goal のみ。maxCommands は持たせない（SAMPLE_SPEC と同じ）。
export const EMPTY_SPEC = { grid: { cols: 5, rows: 5 }, start: { x: 0, y: 0 }, goal: { x: 4, y: 4 }, walls: [] };

// ---- スイッチの設定欄（#404 段A）。spec は盤面 JSON。index は spec.switches の番号。----
const swList = (spec) => (Array.isArray(spec.switches) ? spec.switches : []);

// targets が空で group も無いスイッチ（接続待ち）。[{ index, x, y }]。保存は止める側（E4）が使う。
export function pendingSwitches(spec) {
  return swList(spec).map((s, index) => ({ s, index })).filter(({ s }) => typeof s.group !== 'string' && !(Array.isArray(s.targets) && s.targets.length > 0)).map(({ s, index }) => ({ index, x: s.x, y: s.y }));
}

// mode のラジオ選択肢 [{ value, label, disabled, reason }]。disabled はグレーにして選ばせない（正本は validate の併用禁止）。
// mode は混在してよい（#530）。close は他のスイッチと対象を共有できない。toggle は氷・クッションの上には置けず、他のスイッチと対象を共有できない。
export function switchModeOptions(spec, index) {
  const list = swList(spec);
  const me = list[index];
  const others = list.filter((_, i) => i !== index);
  const options = [
    { value: 'open', label: 'open（踏むと壁が消える）', disabled: false, reason: '' },
    { value: 'close', label: 'close（踏むと壁が出る）', disabled: false, reason: '' },
    { value: 'toggle', label: 'toggle（踏むたびに壁が入れ替わる）', disabled: false, reason: '' },
  ];
  if (!me) return options.map((o) => ({ ...o, disabled: true, reason: 'スイッチが無い' }));
  const set = (value, reason) => { const o = options.find((x) => x.value === value); o.disabled = true; o.reason = reason; };
  // toggle：氷・クッションの上、対象を他と共有しているときは選べない
  if (spec.ice && spec.ice.some((c) => c.x === me.x && c.y === me.y)) set('toggle', 'toggle は氷の上に置けない');
  else if (spec.cushion && spec.cushion.some((c) => c.x === me.x && c.y === me.y)) set('toggle', 'toggle はクッションの上に置けない');
  const mine = Array.isArray(me.targets) ? me.targets : [];
  const shared = others.some((o) => (Array.isArray(o.targets) ? o.targets : []).some((u) => mine.some((t) => t.x === u.x && t.y === u.y)));
  if (!options.find((x) => x.value === 'toggle').disabled && shared) set('toggle', 'toggle は他のスイッチと対象を共有できない');
  if (shared) set('close', 'close は他のスイッチと対象を共有できない（AND不可）');
  return options;
}

// ---- スイッチの group（#404 段B）。同じ group がスイッチと壁（groupWalls）を対応づける。----
export const GROUP_CHOICES = ['a', 'b', 'c', 'd']; // 選べる名前（盤にこれ以外の名前があれば、その名前も並ぶ）

// group が付いているのに壁（groupWalls）が1つも無いスイッチ（接続待ち）。[{ index, x, y }]。
export function pendingGroupSwitches(spec) {
  const walls = Array.isArray(spec.groupWalls) ? spec.groupWalls : [];
  return swList(spec).map((s, index) => ({ s, index })).filter(({ s }) => typeof s.group === 'string' && !walls.some((w) => w && w.group === s.group)).map(({ s, index }) => ({ index, x: s.x, y: s.y }));
}

// group のラジオ選択肢 [{ value, label, disabled, reason }]。value '' は「なし」。disabled はグレーで選べない（正本は validate）。
// targets のあるスイッチは group を付けられない（mode は問わない。#530）。同じ group を付けられるスイッチは1つだけ。
export function switchGroupOptions(spec, index) {
  const list = swList(spec);
  const me = list[index];
  const used = new Set(list.filter((_, i) => i !== index).map((o) => o.group).filter((g) => typeof g === 'string'));
  const names = [...GROUP_CHOICES];
  if (me && typeof me.group === 'string' && !names.includes(me.group)) names.push(me.group);
  const options = [{ value: '', label: 'なし（壁を1つずつつなぐ）', disabled: false, reason: '' }, ...names.map((g) => ({ value: g, label: `group「${g}」`, disabled: false, reason: '' }))];
  if (!me) return options.map((o) => ({ ...o, disabled: true, reason: 'スイッチが無い' }));
  const mine = typeof me.group === 'string' ? me.group : '';
  for (const o of options) {
    if (o.value === '' || o.value === mine) continue;
    if (Array.isArray(me.targets) && me.targets.length > 0) { o.disabled = true; o.reason = 'group と targets は併用できない（先に壁の接続を外す）'; }
    else if (used.has(o.value)) { o.disabled = true; o.reason = 'この group は他のスイッチが使っている（1つだけ）'; }
  }
  return options;
}

// ---- かぎ・ドア（#523 段1）----
// 相手の無いかぎ・ドア（接続待ち）。[{ kind: 'keys' | 'doors', index, x, y }]。
// ドアは「同じ色のかぎが無い」（validate の keys.js と同じ基準）、かぎは「同じ色のドアが無い」（置いただけでは飾り＝必須判定で NG になる先出し）。
export function pendingKeys(spec) {
  const keys = Array.isArray(spec.keys) ? spec.keys : [];
  const doors = Array.isArray(spec.doors) ? spec.doors : [];
  const out = [];
  doors.forEach((d, index) => { if (!keys.some((k) => k.color === d.color)) out.push({ kind: 'doors', index, x: d.x, y: d.y }); });
  keys.forEach((k, index) => { if (!doors.some((d) => d.color === k.color)) out.push({ kind: 'keys', index, x: k.x, y: k.y }); });
  return out;
}

// ---- 水の橋（#523 段3）----
// 上下左右に水が無い橋（接続待ち）。[{ index, x, y }]。基準は validate の water.js（「bridge の上下左右に水が無い」）と同じ。
export function pendingBridges(spec) {
  const bridge = Array.isArray(spec.bridge) ? spec.bridge : [];
  const water = Array.isArray(spec.water) ? spec.water : [];
  return bridge.map((b, index) => ({ b, index })).filter(({ b }) => !water.some((w) => Math.abs(w.x - b.x) + Math.abs(w.y - b.y) === 1)).map(({ b, index }) => ({ index, x: b.x, y: b.y }));
}

// ---- ぬりマス（#523 段4）----
// 目標マス（paint）があるのに start（または goal）が目標に含まれない印。[{ kind: 'start' | 'goal', x, y }]。基準は validate の paint.js（「paint に start のマスが含まれない」）と同じ。
// 目標が1つも無い盤（paint 未使用）は対象外。
export function pendingPaint(spec) {
  const paint = Array.isArray(spec.paint) ? spec.paint : [];
  if (paint.length === 0) return [];
  return ['start', 'goal'].filter((k) => spec[k] && !paint.some((c) => c.x === spec[k].x && c.y === spec[k].y)).map((k) => ({ kind: k, x: spec[k].x, y: spec[k].y }));
}

// ---- たたき台の生成（#401 段2）。範囲は POST /api/generate（tools/lib/validate/stagegen.mjs の checkStageGen）と同じ ----
export const GEN_COUNT = 4; // 1回に出す候補の数（2×2）。「もう4枚」は seed をこの数だけ進める
export const GEN_LIMITS = { grid: [3, 20], walls: [0, 60], shortestPath: [2, 60], minTurns: [0, 8], items: [1, 4], ice: [1, 4], keys: [1, 2], cushion: [1, 4], switches: [1, 2], warps: [1, 2], periodic: [1, 2], paint: [4, 8], water: [2, 8] };
export const GEN_GIMMICKS = [['items', 'どんぐり'], ['ice', 'こおり'], ['keys', 'かぎ'], ['cushion', 'クッション'], ['switches', 'スイッチ'], ['warps', 'ワープ'], ['periodic', '周期ドア'], ['paint', '色ぬり'], ['water', '水']];
// 他のギミックと併用できない（単独で使う）ギミック。要素を足せば checkGenerateForm の同じ検査が働く。
export const GEN_SOLO_GIMMICKS = ['paint'];
// 単独集合の要素ごとの例外（併用してよい相手）。paint は water とだけ併用できる（#531 段2）。
export const GEN_SOLO_EXCEPT = { paint: ['water'] };
// 同時に1種までのギミック（他のギミックとは併用できる。#531）。
export const GEN_ONE_OF_GIMMICKS = ['warps', 'periodic', 'water'];
const isInteger = (v) => Number.isInteger(v);

// フォームの値 { cols:{min,max}, rows, walls, shortestPath, minTurns, seed, teach, gimmicks:{items:{on,min,max},ice,keys,cushion,switches,warps,periodic,paint,water} } を送る前に検査する。
// 問題の文字列の配列（空なら送れる）。
export function checkGenerateForm(form) {
  const out = [];
  const range = (label, v, [lo, hi]) => {
    if (!v || !isInteger(v.min) || !isInteger(v.max) || v.min < lo || v.max > hi || v.min > v.max) out.push(`${label} は ${lo}〜${hi} の整数で 最小≦最大 にしてください`);
  };
  range('よこ', form.cols, GEN_LIMITS.grid);
  range('たて', form.rows, GEN_LIMITS.grid);
  range('かべ', form.walls, GEN_LIMITS.walls);
  range('最短手数', form.shortestPath, GEN_LIMITS.shortestPath);
  if (!isInteger(form.minTurns) || form.minTurns < GEN_LIMITS.minTurns[0] || form.minTurns > GEN_LIMITS.minTurns[1]) out.push(`曲がる回数の下限 は ${GEN_LIMITS.minTurns[0]}〜${GEN_LIMITS.minTurns[1]} の整数にしてください`);
  if (!isInteger(form.seed) || form.seed < 0) out.push('シード は 0 以上の整数にしてください');
  const on = GEN_GIMMICKS.filter(([k]) => form.gimmicks && form.gimmicks[k] && form.gimmicks[k].on);
  for (const [k, label] of on) range(label, form.gimmicks[k], GEN_LIMITS[k]);
  const isOn = (k) => on.some(([name]) => name === k);
  if (isOn('switches') && isOn('keys')) out.push('スイッチと かぎは いっしょに 使えません');
  if (form.teach === 'cushion' && on.length > 0 && !isOn('ice')) out.push('おしえる物が クッションのときは こおりも オンにしてください');
  for (const [k, label] of on) {
    if (GEN_SOLO_GIMMICKS.includes(k) && on.some(([o]) => o !== k && !(GEN_SOLO_EXCEPT[k] ?? []).includes(o))) out.push(`${label}は ほかのギミックと いっしょに 使えません（${label}だけ オンにしてください）`);
  }
  const oneOfOn = GEN_ONE_OF_GIMMICKS.filter((k) => isOn(k));
  if (oneOfOn.length > 1) out.push(`${oneOfOn.join('・')} は同時に指定できない（${GEN_ONE_OF_GIMMICKS.join('・')} は1種まで）`);
  if (on.length > 0 && !on.some(([k]) => k === form.teach)) out.push('おしえる物 は 使うギミックから選んでください');
  return out;
}

// 検査を通ったフォームから POST /api/generate の本文を作る。ギミックなしなら gimmicks・teach は付けない。
export function buildGenerateBody(form, seed) {
  const on = GEN_GIMMICKS.filter(([k]) => form.gimmicks[k] && form.gimmicks[k].on).map(([k]) => k);
  const stageGen = { grid: { cols: { ...form.cols }, rows: { ...form.rows } }, walls: { ...form.walls }, shortestPath: { ...form.shortestPath }, minTurns: form.minTurns };
  if (on.length > 0) {
    stageGen.gimmicks = Object.fromEntries(on.map((k) => [k, { min: form.gimmicks[k].min, max: form.gimmicks[k].max }]));
    stageGen.teach = form.teach;
  }
  return { stageGen, count: GEN_COUNT, seed };
}

// 生成の状態の文言。'running'（生成中）／'empty'（0件）／'aborted'（探索量の上限で未完了）。それ以外は空。
export function generateStatusText(status) {
  if (status === 'running') return 'つくっています…';
  if (status === 'empty') return '条件に合う盤が出なかった。範囲を広げる';
  if (status === 'aborted') return '重すぎて途中で止めた。大きさかギミックを減らす';
  return '';
}
