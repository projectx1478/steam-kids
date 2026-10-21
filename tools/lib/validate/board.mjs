// 盤面検証（checkBoard・色連動スイッチ・スイッチ必須性）。tools/lib/validate/ からの分割（Issue #448）。
import { shortestSteps, shortestChips, boardSpec } from '../../../js/engine-grid.js';
import { GIMMICKS } from '../../../js/gimmicks/index.js';
import { expandGroupSwitches } from '../../../js/gimmicks/switches.js';
import { COMMANDS, inGrid, isPoint, validGroup, GROUP_MAX_LEN } from './common.mjs';

// 色連動スイッチ（Issue #392）の検査 (a)〜(h) と (e)。(i) の座標（整数・盤内）は checkBoard 側で、coordChecks の後の別ループで検査する。
// 展開前の盤を見る。NG を1件でも出したら true を返す（呼び出し側が必須性・罠の意味の節を飛ばす）。
function checkGroupSwitches(board, add, label) {
  let ng = false;
  const bad = (msg) => {
    ng = true;
    add('色連動スイッチ', `${label}${msg}`);
  };
  const sws = Array.isArray(board.switches) ? board.switches : [];
  if (board.groupWalls !== undefined && !Array.isArray(board.groupWalls)) bad(`groupWalls=${JSON.stringify(board.groupWalls)} が配列でない`);
  const gws = Array.isArray(board.groupWalls) ? board.groupWalls : [];
  const counts = new Map();
  sws.forEach((s, i) => {
    if (!s || s.group === undefined) return;
    if (!validGroup(s.group)) bad(`switches[${i}].group=${JSON.stringify(s.group)} が不正（長さ1〜${GROUP_MAX_LEN}の文字列）`);
    else counts.set(s.group, (counts.get(s.group) ?? 0) + 1);
    if (s.targets !== undefined) bad(`switches[${i}] が group と targets を併用している`);
    if (s.color === undefined) bad(`switches[${i}] の group にはcolorの明示が必要`);
    if (s.mode === 'close' || s.mode === 'toggle') bad(`switches[${i}] の group は mode=${JSON.stringify(s.mode)} と併用できない`);
  });
  counts.forEach((n, g) => {
    if (n > 1) bad(`group=${JSON.stringify(g)} のスイッチが${n}個ある（1つだけ）`);
    if (!gws.some((w) => w?.group === g)) bad(`group=${JSON.stringify(g)} のスイッチに対応するgroupWallsが無い`);
  });
  gws.forEach((w, i) => {
    if (!validGroup(w?.group)) bad(`groupWalls[${i}].group=${JSON.stringify(w?.group)} が不正（長さ1〜${GROUP_MAX_LEN}の文字列）`);
    else if (!counts.has(w.group)) bad(`groupWalls[${i}] の group=${JSON.stringify(w.group)} に対応するスイッチが無い`);
  });
  // (e) 重なり。groupWalls のマスが、壁・start・goal・他ギミック・スイッチ・その対象・他の groupWalls と重ならない。
  const keyOf = (p) => `${p.x},${p.y}`;
  const pts = (v) => (Array.isArray(v) ? v : []).filter(isPoint);
  const others = [
    ['壁', pts(board.walls)],
    ['start', pts(board.start ? [board.start] : [])],
    ['goal', pts(board.goal ? [board.goal] : [])],
    ['items', pts(board.items)],
    ['ice', pts(board.ice)],
    ['cushion', pts(board.cushion)],
    ['water', pts(board.water)],
    ['bridge', pts(board.bridge)],
    ['keys', pts(board.keys)],
    ['doors', pts(board.doors)],
    ['paint', pts(board.paint)],
    ['periodic', pts(board.periodic)],
    ['スイッチ', pts(sws)],
    ['スイッチの対象', sws.flatMap((s) => pts(s?.targets))],
  ].map(([name, list]) => [name, new Set(list.map(keyOf))]);
  const seen = new Set();
  gws.forEach((w, i) => {
    if (!isPoint(w)) return;
    const k = keyOf(w);
    others.forEach(([name, set]) => {
      if (set.has(k)) bad(`groupWalls[${i}] が${name}と重なる`);
    });
    if (seen.has(k)) bad(`groupWalls[${i}] が他のgroupWallsと重なる`);
    seen.add(k);
  });
  return ng;
}

// ワープ（Issue #64）の形式検査。キーは warps のみ（単数形 warp は受け付けない）。
// x は 0..cols-1・y は 0..rows-1 の整数、pair は 1 か 2、各 pair はちょうど2個、組は最大2。
// 壁・start・goal・他ギミックのマスと重ならず、ice・paint・periodic とは併用できない。
function checkWarps(board, add, label) {
  const bad = (msg) => add('盤面の妥当性', `${label}${msg}`);
  if (board.warp !== undefined) bad('warp は廃止（キーは warps）');
  if (board.warps === undefined) return;
  if (!Array.isArray(board.warps)) {
    bad(`warps=${JSON.stringify(board.warps)} が配列でない`);
    return;
  }
  const grid = board.grid || {};
  const list = (v) => (Array.isArray(v) ? v : []);
  const keyOf = (p) => `${p.x},${p.y}`;
  const isInt2 = (p) => p && Number.isInteger(p.x) && Number.isInteger(p.y);
  const counts = new Map();
  const seen = new Set();
  const cellSets = [
    ['壁', list(board.walls)],
    ['start', board.start ? [board.start] : []],
    ['goal', board.goal ? [board.goal] : []],
    ['items', list(board.items)],
    ['ice', list(board.ice)],
    ['cushion', list(board.cushion)],
    ['water', list(board.water)],
    ['bridge', list(board.bridge)],
    ['keys', list(board.keys)],
    ['doors', list(board.doors)],
    ['switches', list(board.switches)],
    ['switchesのtargets', list(board.switches).flatMap((s) => list(s?.targets))],
    ['groupWalls', list(board.groupWalls)],
    ['periodic', list(board.periodic)],
  ].map(([name, pts]) => [name, new Set(pts.filter(isInt2).map(keyOf))]);
  board.warps.forEach((w, i) => {
    if (!isInt2(w) || !inGrid(grid, w)) {
      bad(`warps[${i}]=${JSON.stringify(w)} が盤外か整数でない`);
    } else {
      const k = keyOf(w);
      if (seen.has(k)) bad(`warps[${i}] が他のwarpsと同じマス`);
      seen.add(k);
      for (const [name, set] of cellSets) if (set.has(k)) bad(`warps[${i}] が${name}と重なる`);
    }
    if (w?.pair !== 1 && w?.pair !== 2) bad(`warps[${i}].pair=${JSON.stringify(w?.pair)} が1か2でない`);
    else counts.set(w.pair, (counts.get(w.pair) ?? 0) + 1);
  });
  counts.forEach((n, pair) => {
    if (n !== 2) bad(`warps の pair=${pair} が${n}個ある（ちょうど2個）`);
  });
}

// play/tutorialに共通の盤面検証（allowedCommands・座標範囲・start/goal・壁重なり・item重複）。
// labelはエラー文言の頭に付ける識別子（play=''、tutorialは`stepId="…" の`）（Issue #81）。
export function checkBoard(board, add, label) {
  const grid = board.grid || {};
  const walls = Array.isArray(board.walls) ? board.walls : [];
  const wallKeySet = new Set(walls.map((w) => `${w.x},${w.y}`));
  const items = Array.isArray(board.items) ? board.items : [];
  const ice = Array.isArray(board.ice) ? board.ice : [];
  const cushion = Array.isArray(board.cushion) ? board.cushion : [];
  const waterList = Array.isArray(board.water) ? board.water : [];
  const bridgeList = Array.isArray(board.bridge) ? board.bridge : [];
  const keys = Array.isArray(board.keys) ? board.keys : [];
  const doors = Array.isArray(board.doors) ? board.doors : [];
  const switchList = Array.isArray(board.switches) ? board.switches : [];
  const groupWallList = Array.isArray(board.groupWalls) ? board.groupWalls : [];

  if (!Number.isInteger(grid.cols) || !Number.isInteger(grid.rows) || grid.cols < 1 || grid.cols > 20 || grid.rows < 1 || grid.rows > 20) {
    add('盤面の妥当性', `${label}盤面の大きさは20×20以内（${grid.cols}×${grid.rows}）`);
  }

  if (!Array.isArray(board.allowedCommands) || board.allowedCommands.some((c) => !COMMANDS.includes(c))) {
    add('命令語彙', `${label}allowedCommands=${JSON.stringify(board.allowedCommands)} が不正`);
  }

  const coordChecks = [
    ['start', board.start],
    ['goal', board.goal],
    ...walls.map((w, i) => [`walls[${i}]`, w]),
    ...items.map((it, i) => [`items[${i}]`, it]),
    ...ice.map((c, i) => [`ice[${i}]`, c]),
    ...cushion.map((c, i) => [`cushion[${i}]`, c]),
    ...waterList.map((c, i) => [`water[${i}]`, c]),
    ...bridgeList.map((c, i) => [`bridge[${i}]`, c]),
    ...keys.map((c, i) => [`keys[${i}]`, c]),
    ...doors.map((c, i) => [`doors[${i}]`, c]),
    ...switchList.flatMap((s, i) => [
      [`switches[${i}]`, s],
      ...(Array.isArray(s?.targets) ? s.targets : []).map((t, j) => [`switches[${i}].targets[${j}]`, t]),
    ]),
  ];
  for (const [coordLabel, p] of coordChecks) {
    if (!p || !inGrid(grid, p)) add('座標範囲', `${label}${coordLabel}=${JSON.stringify(p)} が盤外`);
  }
  // groupWalls の座標（Issue #392 の検査 (i)）：整数で盤内。
  let groupNg = checkGroupSwitches(board, add, label);
  groupWallList.forEach((w, i) => {
    if (!w || !Number.isInteger(w.x) || !Number.isInteger(w.y) || !inGrid(grid, w)) {
      groupNg = true;
      add('座標範囲', `${label}groupWalls[${i}]=${JSON.stringify(w)} が盤外か整数でない`);
    }
  });

  if (board.start && board.goal) {
    if (board.start.x === board.goal.x && board.start.y === board.goal.y) {
      add('盤面の妥当性', `${label}start と goal が同一`);
    }
    if (wallKeySet.has(`${board.start.x},${board.start.y}`)) add('盤面の妥当性', `${label}start が壁と重なる`);
    if (wallKeySet.has(`${board.goal.x},${board.goal.y}`)) add('盤面の妥当性', `${label}goal が壁と重なる`);
  }

  checkWarps(board, add, label);
  for (const g of GIMMICKS) g.validate(board, add, label);
  return groupNg;
}

// スイッチの必須性・罠の意味・かぎの順序の節（呼び出せる関数に切り出し。Issue #392）。入口で色連動を展開する。
// distはこの盤の最短（null＝判定しない）。(a)〜(i) の NG が出た盤では呼ばない。
export function checkSwitchMatters(rawPlay, dist, add, label) {
  const play = expandGroupSwitches(rawPlay);
  // 切替壁を静的な壁のまま（スイッチ無し）にしても届くなら、スイッチが飾り。
  const closeSwitches = Array.isArray(play.switches) && play.switches.length > 0 && play.switches.every((s) => s?.mode === 'close');
  // closeは罠：スイッチを無効化（踏んでも壁が出ない=スイッチ無し）した盤の最短より、実際の最短が長くなければ罠が無意味
  // （最短経路がスイッチを通らない、または出た壁が経路に効かない）。出現後の到達不能は上のゴール到達可能性で検出する。
  const toggleSwitches = Array.isArray(play.switches) && play.switches.length > 0 && play.switches.every((s) => s?.mode === 'toggle');
  if (dist !== null && closeSwitches) {
    const disabled = boardSpec({ ...play, switches: [] });
    const disabledDist = play.groupRepeats ? shortestChips(disabled) : shortestSteps(disabled);
    if (!(dist > disabledDist)) {
      add('スイッチの罠の意味', `${label}スイッチ無効化盤の最短(${disabledDist})より最短(${dist})が長くない（出る壁が経路に効かない）`);
    }
  } else if (dist !== null && toggleSwitches) {
    // toggle（Issue #388）。踏まない盤＝closedの壁だけを壁、openの壁を床に直した盤。
    const closedOf = (s) => (Array.isArray(s.targets) ? s.targets : []).filter((t) => t?.initial !== 'open');
    const noStep = boardSpec({ ...play, walls: [...(play.walls || []), ...play.switches.flatMap(closedOf)], switches: [] });
    const noStepDist = play.groupRepeats ? shortestChips(noStep) : shortestSteps(noStep);
    if (noStepDist <= play.maxCommands) {
      add('スイッチの必須性', `${label}スイッチを踏まずにmaxCommands=${play.maxCommands}以内でゴールできる（最短${noStepDist}）`);
    }
    // トグルの意味：closedの壁をmode:"open"、openの壁を常時床にした盤の最短より、toggleの最短が厳密に長いこと（導入盤の免除なし）。
    if (dist !== Infinity) {
      const asOpen = boardSpec({ ...play, switches: play.switches.map((s) => ({ ...s, mode: 'open', targets: closedOf(s).map(({ x, y }) => ({ x, y })) })) });
      const asOpenDist = play.groupRepeats ? shortestChips(asOpen) : shortestSteps(asOpen);
      if (!(dist > asOpenDist)) {
        add('トグルの意味', `${label}openに置き換えた盤の最短(${asOpenDist})より最短(${dist})が長くない（もう一度踏む・戻る手が要らず、toggleが飾り）`);
      }
    }
  } else if (dist !== null && Array.isArray(play.switches) && play.switches.length > 0) {
    const targets = play.switches.flatMap((s) => (Array.isArray(s.targets) ? s.targets : []));
    const noSwitch = boardSpec({ ...play, walls: [...(play.walls || []), ...targets], switches: [] });
    const noSwitchDist = play.groupRepeats ? shortestChips(noSwitch) : shortestSteps(noSwitch);
    if (noSwitchDist <= play.maxCommands) {
      add('スイッチの必須性', `${label}スイッチを踏まずにmaxCommands=${play.maxCommands}以内でゴールできる（最短${noSwitchDist}）`);
    }
  }
  // スイッチ→鍵の順序：スイッチが無効（対象は壁のまま）でも鍵に届くなら、順序が強制されていない。
  // かぎが1つの盤だけを対象にする（複数のとき、どのかぎを順序に使うかは未定義のため対象外）。
  if (
    dist !== null &&
    !closeSwitches &&
    Array.isArray(play.switches) &&
    play.switches.length > 0 &&
    Array.isArray(play.keys) &&
    play.keys.length === 1
  ) {
    const targets = play.switches.flatMap((s) => (Array.isArray(s.targets) ? s.targets : []));
    const toKey = boardSpec({
      ...play,
      walls: [...(play.walls || []), ...targets],
      switches: [],
      items: [],
      goal: { x: play.keys[0].x, y: play.keys[0].y },
    });
    const toKeyDist = play.groupRepeats ? shortestChips(toKey) : shortestSteps(toKey);
    if (toKeyDist <= play.maxCommands) {
      add('スイッチ→かぎの順序', `${label}スイッチを踏まずにmaxCommands=${play.maxCommands}以内でかぎに届く（最短${toKeyDist}）`);
    }
  }
}
