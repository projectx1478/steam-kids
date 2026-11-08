// sort-order（レシピの順番。play.sortOrder）の検証（Issue #292）。
import { solutionsOf, isSolved } from '../../../js/engine-sortorder.js';
import { plainSegmentsText, plainReading, parseSegments, rubyGrade, KANJI_RE } from '../../../js/text-render.js';
import { FORBIDDEN_WORDS, isObj } from './common.mjs';

export const SORT_PLAY_COUNT = 8;
const FAILS = ['burn', 'spill', 'raw', 'empty'];
const CARD_EXTRA_FORBIDDEN = 'ない';
const ID_RE = /^[A-Za-z0-9]+$/;
const segmenter = new Intl.Segmenter('ja', { granularity: 'grapheme' });
const graphemes = (s) => [...segmenter.segment(s)].length;

// cards[].text：lesson.mjs の step.text と同じ検査（ルビ外の漢字・中括弧・配当表・20字・否定語）。
function checkText(text, add, label) {
  if (typeof text !== 'string' || text === '') {
    add('カードの文言', `${label}text が空か文字列でない`);
    return;
  }
  const outside = plainSegmentsText(text);
  if (KANJI_RE.test(outside)) add('ルビ外の漢字', `${label}text にルビ記法外の漢字がある`);
  if (outside.includes('{') || outside.includes('}')) add('ルビ記法', `${label}text の中括弧が壊れている`);
  for (const seg of parseSegments(text)) {
    if (typeof seg === 'string') continue;
    if (rubyGrade(seg.kanji) === null) add('配当表外の漢字', `${label}{${seg.kanji}|${seg.kana}} に配当表に無い漢字がある`);
    if (KANJI_RE.test(seg.kana)) add('ルビ記法', `${label}{${seg.kanji}|${seg.kana}} のよみに漢字が混じっている`);
  }
  const reading = plainReading(text);
  if ([...reading].length > 20) add('文字数', `${label}text が展開後20字超`);
  // カードは手順の言い切りなので、lesson.mjs の否定語に加えて「ない」も不可（boards/README の fail-text-negative に合わせる）。
  for (const word of [...FORBIDDEN_WORDS, CARD_EXTRA_FORBIDDEN]) {
    if (reading.includes(word)) add('否定語', `${label}text に否定語「${word}」がある`);
  }
}

// 1面の検査。形が壊れていれば null、通れば { n, solutions, unconstrained } を返す（不合格でも計算できた分は返す）。
export function checkSortFace(play, add0, label) {
  let nErr = 0;
  const add = (rule, detail) => { nErr += 1; add0(rule, detail); };
  const so = play?.sortOrder;
  if (!isObj(so)) {
    add('sortOrderの形', `${label}sortOrder が object でない`);
    return null;
  }
    const cards = Array.isArray(so.cards) ? so.cards : null;
  if (!cards) add('カード枚数', `${label}cards が配列でない`);
  else if (cards.length < 3 || cards.length > 5) add('カード枚数', `${label}cards=${cards.length}枚（3〜5枚である必要がある）`);
  const ids = new Set();
  for (const c of cards || []) {
    const cl = `${label}カード id=${JSON.stringify(c?.id)} の`;
    if (!isObj(c)) { add('カードの形', `${label}cards に object でない要素がある`); continue; }
    if (typeof c.id !== 'string' || !ID_RE.test(c.id)) add('カードid', `${cl}id が空か英数字でない`);
    else if (ids.has(c.id)) add('カードid重複', `${cl}id が重複している`);
    else ids.add(c.id);
    if (typeof c.icon !== 'string' || c.icon === '' || graphemes(c.icon) !== 1) add('カードのicon', `${cl}icon が絵文字1字でない`);
    checkText(c.text, add, cl);
  }
  const before = Array.isArray(so.before) ? so.before : null;
  if (!before || before.length === 0) add('beforeの本数', `${label}before が空か配列でない（1本以上必要）`);
  for (const r of before || []) {
    if (!isObj(r)) { add('beforeの形', `${label}before に object でない要素がある`); continue; }
    if (!ids.has(r.a) || !ids.has(r.b)) add('beforeのid', `${label}before ${JSON.stringify(r.a)}→${JSON.stringify(r.b)} が cards に無い id を参照`);
    else if (r.a === r.b) add('beforeの自己ループ', `${label}before の a と b が同じ（${r.a}）`);
    if ('fail' in r && !FAILS.includes(r.fail)) add('failの値', `${label}before の fail=${JSON.stringify(r.fail)} が ${FAILS.join('／')} 以外`);
  }
  if (nErr > 0) return null; // 形が壊れていれば順列は数えない
  const order = cards.map((c) => c.id);
  const solutions = solutionsOf(order, before);
  if (solutions.length === 0) add('循環', `${label}正解が0通り（before が循環している）`);
  if (isSolved(order, before)) add('startが正解', `${label}cards の並びがすでに正解`);
  if (solutions.length > 0) {
    before.forEach((r, i) => {
      const rest = before.filter((_, j) => j !== i);
      if (solutionsOf(order, rest).length <= solutions.length) {
        add('beforeの必須性', `${label}before[${i}] ${r.a}→${r.b} を外しても正解が増えない（冗長）`);
      }
    });
  }
  const used = new Set(before.flatMap((r) => [r.a, r.b]));
  const unconstrained = order.filter((id) => !used.has(id)).length;
  if (unconstrained > 1) add('制約に出ないカード', `${label}制約に出ないカードが${unconstrained}枚（1枚まで）`);
  return { n: order.length, solutions: solutions.length, unconstrained };
}

// レッスン全体（sort-order の play 群）。isLong＝longTrialIds に載っているか。
export function validateSortOrder(playSteps, add, isLong = true) {
  if (!isLong) add('長尺試作', 'sort-order のレッスンは longTrialIds に載せる必要がある');
  if (playSteps.length !== SORT_PLAY_COUNT) add('盤面の必須', `kind="play" が${playSteps.length}個（${SORT_PLAY_COUNT}個である必要がある）`);
  const infos = playSteps.map((p) => checkSortFace(p, add, `stepId="${p.stepId}" の`));
  const seen = new Map();
  playSteps.forEach((p, i) => {
    const so = p.sortOrder;
    if (!isObj(so)) return;
    const key = JSON.stringify({ cards: so.cards, before: so.before });
    if (seen.has(key)) add('面の重複', `stepId="${p.stepId}" が stepId="${seen.get(key)}" と同じ cards＋before`);
    else seen.set(key, p.stepId);
  });
  for (let i = 1; i < infos.length; i += 1) {
    if (infos[i] && infos[i - 1] && infos[i].n < infos[i - 1].n) {
      add('難易度の順序', `stepId="${playSteps[i].stepId}" の枚数(${infos[i].n})が前の面(${infos[i - 1].n})より少ない（枚数は非減少）`);
    }
  }
  const ok = infos.filter(Boolean);
  if (ok.length === infos.length && ok.length > 0) {
    if (!ok.some((f) => f.solutions > 1)) add('全順序の面', '正解が複数ある面（全順序でない面）が1つも無い');
    const faces = ok.filter((f) => f.unconstrained > 0).length;
    if (faces > 1) add('制約に出ないカード', `制約に出ないカードのある面が${faces}面（全面で1面まで）`);
  }
}
