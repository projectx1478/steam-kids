// unfold-cube（てんかいず・はこ。play.unfold）の検証（Issue #289）。
import {
  isCubeNet, countSolutions, CUBE_CELLS, COLOR_IDS, isOpenBoxNet, baseCell, oppositePairs,
  firstColorMismatch, colorSolutionCount, netShapeKey,
} from '../../../js/engine-unfold.js';
import { isObj, isInt } from './common.mjs';

const OPEN_BOX_CELLS = 5;
const MIN_BLANKS = 2;
export const UNFOLD_PLAY_COUNT = 8;
export const UNFOLD_COLS = 5;
export const UNFOLD_ROWS = 3;

const key = (c) => c.x + ',' + c.y;
const isCell = (c) => isObj(c) && isInt(c.x) && isInt(c.y);
const inside = (c, cols, rows) => c.x >= 0 && c.y >= 0 && c.x < cols && c.y < rows;

// 1面の検査。形が壊れていれば null、通れば { n, solutions } を返す。
export function validateUnfoldFace(play, add, label) {
  let nErr = 0;
  const bad = (rule, detail) => { nErr += 1; add(rule, `${label}${detail}`); };
  const u = play?.unfold;
  if (!isObj(u)) { bad('unfoldの形', 'unfold が object でない'); return null; }
  if (u.cols !== UNFOLD_COLS || u.rows !== UNFOLD_ROWS) bad('格子の大きさ', `cols×rows=${u.cols}×${u.rows}（${UNFOLD_COLS}×${UNFOLD_ROWS}である必要がある）`);
  const preset = u.preset;
  if (!Array.isArray(preset)) { bad('presetの形', 'preset が配列でない'); return null; }
  if (preset.some((c) => !isCell(c))) { bad('presetの形', 'preset に {x,y}（整数）でない要素がある'); return null; }
  if (preset.some((c) => !inside(c, UNFOLD_COLS, UNFOLD_ROWS))) bad('presetが格子外', 'preset に格子外のマスがある');
  if (new Set(preset.map(key)).size !== preset.length) bad('presetの重複', 'preset に同じマスが2回ある');
  if (preset.length === 0) bad('presetの枚数', 'preset が0枚（1〜5枚である必要がある）');
  if (preset.length > CUBE_CELLS) bad('presetの枚数', `preset が${preset.length}枚（6枚より多い）`);
  if (preset.length === CUBE_CELLS) bad('始めから解けている', 'preset が6枚（始めから解けている）');
  if (nErr > 0) return null;

  const solutions = countSolutions(UNFOLD_COLS, UNFOLD_ROWS, preset);
  if (solutions === 0) {
    const span = Math.max(...preset.map((a) => Math.max(...preset.map((b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y)))));
    if (span > CUBE_CELLS - 1) bad('presetが連結不可', 'preset が離れていて6マスでつなげられない');
    else bad('正解が0', 'preset を含む展開図が格子内に1つも無い');
    return null;
  }
  const all = countSolutions(UNFOLD_COLS, UNFOLD_ROWS, []);
  if (!(all > solutions)) bad('presetの必須性', `preset を全部外しても正解が増えない（全部外し${all}通り≦正解${solutions}通り）`);
  return { n: preset.length, solutions };
}

// intro の demo（kind:"unfold"）の検査。playSteps＝8面（同じ盤を見せない検査に使う）。
export function checkUnfoldDemo(demo, playSteps, add, label = 'intro の ') {
  if (!isObj(demo)) { add('デモの形', `${label}demo が object でない（unfold-cube では必須）`); return; }
  if (demo.kind !== 'unfold') { add('デモの形', `${label}demo.kind=${JSON.stringify(demo.kind)}（"unfold" である必要がある）`); return; }
  const net = demo.net;
  if (!Array.isArray(net) || net.length !== CUBE_CELLS || net.some((c) => !isCell(c))) { add('デモの形', `${label}demo.net が{x,y}の${CUBE_CELLS}マスでない`); return; }
  if (net.some((c) => !inside(c, UNFOLD_COLS, UNFOLD_ROWS))) { add('デモの形', `${label}demo.net に格子外のマスがある`); return; }
  if (new Set(net.map(key)).size !== CUBE_CELLS) { add('デモの形', `${label}demo.net に同じマスが2回ある`); return; }
  if (!isCubeNet(net)) { add('デモの形', `${label}demo.net が立方体の展開図でない`); return; }
  const set = new Set(net.map(key));
  playSteps.forEach((p, i) => {
    const preset = p?.unfold?.preset;
    if (Array.isArray(preset) && preset.every((c) => isCell(c) && set.has(key(c)))) {
      add('デモが本番と同じ盤', `${label}demo.net が面${i + 1}の preset を含む（本番と同じ盤）`);
    }
  });
}

// レッスン全体（unfold-cube の play 群）。intro＝intro ステップ。isLong＝longTrialIds に載っているか。
export function validateUnfold(playSteps, intro, add, isLong = true) {
  if (!isLong) add('長尺試作', 'unfold-cube のレッスンは longTrialIds に載せる必要がある');
  if (playSteps.length !== UNFOLD_PLAY_COUNT) add('盤面の必須', `kind="play" が${playSteps.length}個（${UNFOLD_PLAY_COUNT}個である必要がある）`);
  const infos = playSteps.map((p) => validateUnfoldFace(p, add, `stepId="${p.stepId}" の `));
  const seen = new Map();
  playSteps.forEach((p) => {
    const preset = p?.unfold?.preset;
    if (!Array.isArray(preset) || preset.some((c) => !isCell(c))) return;
    const k = preset.map(key).sort().join('|');
    if (seen.has(k)) add('面の重複', `stepId="${p.stepId}" が stepId="${seen.get(k)}" と同じ preset`);
    else seen.set(k, p.stepId);
  });
  for (let i = 1; i < infos.length; i += 1) {
    if (infos[i] && infos[i - 1] && infos[i].n > infos[i - 1].n) {
      add('難易度の順序', `stepId="${playSteps[i].stepId}" の preset 枚数(${infos[i].n})が前の面(${infos[i - 1].n})より多い（枚数は非増加）`);
    }
  }
  checkUnfoldDemo(intro?.demo, playSteps, add);
}

// --- 色ぬり（unfold-02。play.unfoldColor。Issue #811） ---

// 1面の検査。形が壊れていれば null、通れば { n（マス数）, blanks（空きの数）, solutions, shape } を返す。
export function validateUnfoldColorFace(play, add, label) {
  let nErr = 0;
  const bad = (rule, detail) => { nErr += 1; add(rule, `${label}${detail}`); };
  const u = play?.unfoldColor;
  if (!isObj(u)) { bad('unfoldColorの形', 'unfoldColor が object でない'); return null; }
  if (!Array.isArray(u.net) || !Array.isArray(u.given)) { bad('unfoldColorの形', 'net・given が配列でない'); return null; }
  if (u.net.some((c) => !isCell(c)) || u.given.some((c) => !isCell(c))) { bad('unfoldColorの形', 'net・given に {x,y}（整数）でない要素がある'); return null; }
  const { net, given } = u;
  if (u.cols !== UNFOLD_COLS || u.rows !== UNFOLD_ROWS) bad('格子の大きさ', `cols×rows=${u.cols}×${u.rows}（${UNFOLD_COLS}×${UNFOLD_ROWS}である必要がある）`);
  if (net.some((c) => !inside(c, UNFOLD_COLS, UNFOLD_ROWS))) bad('netが格子外', 'net に格子外のマスがある');
  if (new Set(net.map(key)).size !== net.length) bad('netの重複', 'net に同じマスが2回ある');
  if (net.length !== OPEN_BOX_CELLS && net.length !== CUBE_CELLS) bad('netの枚数', `net が${net.length}枚（${OPEN_BOX_CELLS}か${CUBE_CELLS}枚である必要がある）`);
  else if (nErr === 0) {
    if (net.length === CUBE_CELLS && !isCubeNet(net)) bad('netが展開図でない', 'net（6マス）が立方体の展開図でない');
    if (net.length === OPEN_BOX_CELLS && !isOpenBoxNet(net)) bad('netが展開図でない', 'net（5マス）がふたのない箱の展開図でない');
  }
  const netSet = new Set(net.map(key));
  if (given.length === 0) bad('givenの形', 'given が0個');
  if (given.some((c) => !COLOR_IDS.includes(c.c))) bad('givenの形', `given の c が ${COLOR_IDS.join('・')} のいずれかでない`);
  if (new Set(given.map(key)).size !== given.length) bad('givenの形', 'given に同じマスが2回ある');
  if (given.some((c) => !netSet.has(key(c)))) bad('givenの形', 'given に net にないマスがある');
  if (nErr > 0) return null;

  const base = baseCell(net);
  if (base && given.some((c) => key(c) === key(base))) bad('givenがそこ', `given が「そこ」(${base.x},${base.y})に色をつけている`);
  const givenColor = new Map(given.map((c) => [key(c), c.c]));
  oppositePairs(net).forEach(([a, b]) => {
    if (givenColor.has(key(a)) && givenColor.has(key(b))) bad('givenが向かい合う', `向かい合う (${a.x},${a.y})(${b.x},${b.y}) の両方が given`);
  });
  if (new Set(given.map((c) => c.c)).size !== given.length) bad('givenの色の重複', 'given に同じ色が2つある');
  const blanks = net.filter((c) => !givenColor.has(key(c)) && !(base && key(base) === key(c)));
  if (blanks.length < MIN_BLANKS) bad('空きの枚数', `空きが${blanks.length}面（${MIN_BLANKS}面以上である必要がある）`);
  for (const col of COLOR_IDS) {
    const colors = Object.fromEntries(givenColor);
    blanks.forEach((c) => { colors[key(c)] = col; });
    if (firstColorMismatch(net, colors) === null) { bad('ひと色で解ける', `空きを全部「${col}」で塗ると解ける`); break; }
  }
  return { n: net.length, blanks: blanks.length, solutions: colorSolutionCount(net, Object.fromEntries(givenColor)), shape: netShapeKey(net) };
}

// intro の demo（kind:"unfold"・net の各マスに色 c）の検査。playSteps＝8面。
export function checkUnfoldColorDemo(demo, playSteps, add, label = 'intro の ') {
  if (!isObj(demo)) { add('デモの形', `${label}demo が object でない（unfold-cube では必須）`); return; }
  if (demo.kind !== 'unfold') { add('デモの形', `${label}demo.kind=${JSON.stringify(demo.kind)}（"unfold" である必要がある）`); return; }
  const net = demo.net;
  if (!Array.isArray(net) || net.length !== CUBE_CELLS || net.some((c) => !isCell(c))) { add('デモの形', `${label}demo.net が{x,y}の${CUBE_CELLS}マスでない`); return; }
  if (net.some((c) => !inside(c, UNFOLD_COLS, UNFOLD_ROWS))) { add('デモの形', `${label}demo.net に格子外のマスがある`); return; }
  if (new Set(net.map(key)).size !== CUBE_CELLS) { add('デモの形', `${label}demo.net に同じマスが2回ある`); return; }
  if (!isCubeNet(net)) { add('デモの形', `${label}demo.net が立方体の展開図でない`); return; }
  if (net.some((c) => !COLOR_IDS.includes(c.c))) { add('デモの形', `${label}demo.net の c が ${COLOR_IDS.join('・')} のいずれかでないマスがある`); return; }
  if (firstColorMismatch(net, Object.fromEntries(net.map((c) => [key(c), c.c]))) !== null) add('デモの形', `${label}demo.net の向かい合う面の色がそろっていない`);
  if (new Set(net.map((c) => c.c)).size !== COLOR_IDS.length) add('デモの形', `${label}demo.net が${COLOR_IDS.length}色を全部使っていない`);
  const set = net.map(key).sort().join('|');
  playSteps.forEach((p, i) => {
    const pn = p?.unfoldColor?.net;
    if (Array.isArray(pn) && pn.every(isCell) && pn.map(key).sort().join('|') === set) {
      add('デモが本番と同じ盤', `${label}demo.net が面${i + 1}の net と同じ（本番と同じ盤）`);
    }
  });
}

// レッスン全体（unfold-cube の play 群が全部 unfoldColor のとき）。
export function validateUnfoldColor(playSteps, intro, add, isLong = true) {
  if (!isLong) add('長尺試作', 'unfold-cube のレッスンは longTrialIds に載せる必要がある');
  if (playSteps.length !== UNFOLD_PLAY_COUNT) add('盤面の必須', `kind="play" が${playSteps.length}個（${UNFOLD_PLAY_COUNT}個である必要がある）`);
  const infos = playSteps.map((p) => validateUnfoldColorFace(p, add, `stepId="${p.stepId}" の `));
  playSteps.forEach((p, i) => {
    const net = p?.unfoldColor?.net;
    if (!Array.isArray(net)) return;
    const want = i < 2 ? OPEN_BOX_CELLS : CUBE_CELLS;
    if (net.length !== want) add('面の枚数の並び', `stepId="${p.stepId}" の net が${net.length}マス（${i + 1}番目の面は${want}マスである必要がある。1・2番目は${OPEN_BOX_CELLS}、3番目以降は${CUBE_CELLS}）`);
  });
  for (let i = 1; i < infos.length; i += 1) {
    if (infos[i] && infos[i - 1] && infos[i].blanks < infos[i - 1].blanks) {
      add('難易度の順序', `stepId="${playSteps[i].stepId}" の空き(${infos[i].blanks})が前の面(${infos[i - 1].blanks})より少ない（空きは非減少）`);
    }
  }
  const shapes = new Map();
  infos.forEach((f, i) => { if (f) shapes.set(f.shape, [...(shapes.get(f.shape) || []), playSteps[i].stepId]); });
  for (const [shape, ids] of shapes) {
    if (ids.length >= 3) add('型の重複', `同じ型（${shape}）の面が${ids.length}つある（${ids.join('・')}。同じ型は2面まで）`);
  }
  const seen = new Map();
  playSteps.forEach((p) => {
    const u = p?.unfoldColor;
    if (!isObj(u) || !Array.isArray(u.net) || !Array.isArray(u.given) || ![...u.net, ...u.given].every(isCell)) return;
    const k = `${u.net.map(key).sort().join('|')}#${u.given.map((c) => `${key(c)}${c.c}`).sort().join('|')}`;
    if (seen.has(k)) add('面の重複', `stepId="${p.stepId}" が stepId="${seen.get(k)}" と同じ net と given`);
    else seen.set(k, p.stepId);
  });
  checkUnfoldColorDemo(intro?.demo, playSteps, add);
}
