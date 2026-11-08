// unfold-cube（てんかいず・はこ。play.unfold）の検証（Issue #289）。
import { isCubeNet, countSolutions, CUBE_CELLS } from '../../../js/engine-unfold.js';
import { isObj, isInt } from './common.mjs';

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
