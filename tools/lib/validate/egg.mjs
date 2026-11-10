// build-egg（たまごの みち。play.egg）の検証（Issue #290）。エンジンは js/engine-egg.js と共有する。
import { simulate, solve, ANGLES, MAX_STEPS, EGG_TEXT } from '../../../js/engine-egg.js';
import { FORBIDDEN_WORDS, isObj, isInt } from './common.mjs';

export const EGG_PLAY_COUNT = 8;
export const EGG_COLS = 5;
export const EGG_ROWS = 5;

const key = (c, r) => r * 10 + c;
const hasKanji = (s) => /[一-鿿]/.test(s);

// EGG_TEXT の文言検査（ひらがな・20字以内・否定語と「ない」を使わない）。
export function checkEggText(add) {
  for (const [k, text] of Object.entries(EGG_TEXT)) {
    if ([...text].length > 20) add('文言', `EGG_TEXT.${k} が20字超`);
    if (hasKanji(text)) add('文言', `EGG_TEXT.${k} にルビ外の漢字がある`);
    if (FORBIDDEN_WORDS.some((w) => text.includes(w)) || text.includes('ない')) add('文言', `EGG_TEXT.${k} に否定語がある`);
  }
}

// 1面の検査。形が壊れていれば null、通れば { minParts, minSolutions } を返す。
// index＝面の番号（1始まり。面1だけ置ける点が4つ）。prevMin＝前の面の minParts（非減少の検査用）。
export function checkEggFace(play, add, label = '', index = 0, prevMin = 0) {
  let nErr = 0;
  const bad = (rule, detail) => { nErr += 1; add(rule, `${label}${detail}`); };
  const e = play?.egg;
  if (!isObj(e)) { bad('eggの形', 'egg が object でない'); return null; }
  const g = e.grid;
  if (!isObj(g) || g.cols !== EGG_COLS || g.rows !== EGG_ROWS) { bad('gridの範囲', `grid=${JSON.stringify(g)}（${EGG_COLS}×${EGG_ROWS}である必要がある）`); return null; }
  const { cols, rows } = g;
  const isPt = (p) => isObj(p) && isInt(p.col) && isInt(p.row);
  const inG = (p) => isPt(p) && p.col >= 0 && p.col < cols && p.row >= 0 && p.row < rows;
  if (!isInt(e.col) || e.col < 0 || e.col >= cols || 'row' in e) { bad('eggの列', `egg.col=${JSON.stringify(e.col)}`); return null; }
  for (const f of ['nests', 'obstacles', 'places']) {
    if (!Array.isArray(e[f]) || e[f].some((p) => !isPt(p))) { bad('eggの形', `${f} が{col,row}の配列でない`); return null; }
  }
  const { nests, obstacles: obs, places: pl } = e;
  if (nests.length < 2 || nests.length > 3) bad('nestsの数', `${nests.length}個`);
  if (nests.some((x) => x.row !== rows - 1 || !inG(x))) bad('nestの位置', '下段でない巣がある');
  if (new Set(nests.map((x) => key(x.col, x.row))).size !== nests.length) bad('nestの位置', '座標の重複');
  const correct = nests.filter((x) => x.correct === true).length;
  if (correct !== 1) bad('正解の巣', `${correct}個`);
  const nestKeys = new Set(nests.map((x) => key(x.col, x.row)));
  if (obs.length > 6) bad('obstaclesの範囲', `${obs.length}個`);
  for (const o of obs) if (!inG(o)) bad('obstaclesの範囲', `格子外(${o.col},${o.row})`);
  for (const o of obs) if (nestKeys.has(key(o.col, o.row))) bad('obstaclesの範囲', `巣と重なる(${o.col},${o.row})`);
  if (new Set(obs.map((o) => key(o.col, o.row))).size !== obs.length) bad('obstaclesの範囲', '重複');
  for (const p of pl) if (!inG(p)) bad('placesが格子外', `(${p.col},${p.row})`);
  const distinct = new Set(pl.map((p) => key(p.col, p.row))).size;
  if (index === 1 ? distinct !== 4 : distinct < 8 || distinct > 12) bad('placesの数', `${distinct}点(重複を除く)`);
  const occupied = new Set([...nestKeys, ...obs.map((o) => key(o.col, o.row))]);
  for (const p of pl) if (occupied.has(key(p.col, p.row))) bad('placesが障害物か巣と重なる', `(${p.col},${p.row})`);
  if (!isInt(e.limit) || e.limit < 1 || e.limit > 3) bad('limit範囲', String(e.limit));
  const ang = e.tools?.angles;
  if (!Array.isArray(ang) || ang.length !== ANGLES.length || ang.some((a, i) => a !== ANGLES[i])) bad('anglesの値', JSON.stringify(ang));
  if (e.maxSteps !== MAX_STEPS) bad('maxStepsの値', String(e.maxSteps));
  const sol = e.solution;
  const placeKeys = new Set(pl.map((p) => key(p.col, p.row)));
  if (Array.isArray(sol)) {
    for (const s of sol) {
      if (!isPt(s) || !placeKeys.has(key(s.col, s.row))) bad('solutionがplacesに無い', `(${s?.col},${s?.row})`);
      else if (!isInt(s.angle) || s.angle < 0 || s.angle >= ANGLES.length) bad('anglesの値', `solution の angle=${s.angle}`);
    }
  }
  if (nErr > 0) return null; // 形・範囲で落ちた盤は全探索しない（limit 範囲外での爆発を避ける）

  const info = solve(e);
  if (simulate(e, []).result === 'nest') bad('何も置かなくて成功', '');
  if (info.minParts === null) { bad('解なし', `limit=${e.limit}`); return null; }
  if (!Array.isArray(sol) || sol.length === 0) bad('solutionが再生で失敗', 'solution が空または無し');
  else {
    const r = simulate(e, sol).result;
    if (r !== 'nest') bad('solutionが再生で失敗', r);
    else {
      if (sol.length !== info.minParts) bad('solutionがminPartsと不一致', `${sol.length} vs ${info.minParts}`);
      sol.forEach((_, i) => {
        if (simulate(e, sol.filter((__, j) => j !== i)).result === 'nest') bad('冗長な部品', `${i + 1}枚目を外しても成功`);
      });
    }
  }
  if (info.minParts < prevMin) bad('minPartsが前の面より減る', `${info.minParts} < ${prevMin}`);
  if (e.minParts !== info.minParts) bad('宣言minPartsと不一致', `${e.minParts} vs ${info.minParts}`);
  return nErr > 0 ? null : { minParts: info.minParts, minSolutions: info.minSolutions };
}

// レッスン全体（build-egg の play 群）。isLong＝longTrialIds に載っているか。
export function validateEgg(playSteps, add, isLong = true) {
  if (!isLong) add('長尺試作', 'build-egg のレッスンは longTrialIds に載せる必要がある');
  if (playSteps.length !== EGG_PLAY_COUNT) add('盤面の必須', `kind="play" が${playSteps.length}個（${EGG_PLAY_COUNT}個である必要がある）`);
  checkEggText(add);
  let prev = 0;
  let alt = false;
  const seen = new Map();
  playSteps.forEach((p, i) => {
    const info = checkEggFace(p, add, `stepId="${p.stepId}" の `, i + 1, prev);
    if (info) { prev = info.minParts; if (info.minSolutions > 1) alt = true; }
    if (isObj(p?.egg)) {
      const k = JSON.stringify({ ...p.egg, solution: undefined });
      if (seen.has(k)) add('面の重複', `stepId="${p.stepId}" が stepId="${seen.get(k)}" と同じ盤`);
      else seen.set(k, p.stepId);
    }
  });
  if (playSteps.length === EGG_PLAY_COUNT && !alt) add('別解の面', '最小サイズの解が複数ある面が無い');
}
