// レッスンJSONの文言に書かれたルビ記法 `{漢字|よみ}` の解析・表示（Issue #59）。
// よみレベル未満の漢字はひらがな表示に落とす。1つの{...}に複数の漢字が含まれる場合は
// その中の最大配当学年で判定する（部分的に漢字とひらがなを混在させない）。
// DOM/localStorageに依存しない純粋関数として作る（tools/validate-lessons.mjsからNode上で
// そのままimportして使うため。readingLevel/furiganaは呼び出し側(js/ui-step.js)がSから渡す）。
import { KANJI_GRADE } from './kanji-grades.js';

const RUBY_RE = /\{([^|{}]+)\|([^|{}]+)\}/g;
const KANJI_RE = /[㐀-䶿一-鿿]/;

// text中の{漢字|よみ}を{kanji, kana}、それ以外の地の文をstringのまま並べた配列にする。
// 検証（tools/validate-lessons.mjs）と表示（renderInto）の両方から使う。
export function parseSegments(text) {
  const segments = [];
  let last = 0;
  for (const m of text.matchAll(RUBY_RE)) {
    if (m.index > last) segments.push(text.slice(last, m.index));
    segments.push({ kanji: m[1], kana: m[2] });
    last = m.index + m[0].length;
  }
  if (last < text.length) segments.push(text.slice(last));
  return segments;
}

// ルビ記法の外に生の漢字・中括弧の書き崩れが無いかの判定用。地の文部分のみを連結して返す。
export function plainSegmentsText(text) {
  return parseSegments(text)
    .filter((s) => typeof s === 'string')
    .join('');
}

// 全てひらがなに展開した文字列（20字制限の判定・否定語チェックに使う。表示には使わない）。
export function plainReading(text) {
  return parseSegments(text)
    .map((s) => (typeof s === 'string' ? s : s.kana))
    .join('');
}

// {漢字|よみ}のkanji部分に含まれる文字の最大配当学年。配当表に無い文字が含まれる場合はnull。
export function rubyGrade(kanji) {
  let max = 0;
  for (const c of kanji) {
    const g = KANJI_GRADE.get(c);
    if (g === undefined) return null;
    max = Math.max(max, g);
  }
  return max;
}

// 文中で使われている漢字の最大配当学年（無ければnull）。validate-lessons.mjsの情報表示用。
export function textKanjiMaxGrade(text) {
  let max = null;
  for (const seg of parseSegments(text)) {
    if (typeof seg === 'string') continue;
    const g = rubyGrade(seg.kanji);
    if (g !== null) max = max === null ? g : Math.max(max, g);
  }
  return max;
}

function appendSegment(parent, seg, readingLevel, furigana) {
  if (typeof seg === 'string') {
    parent.appendChild(document.createTextNode(seg));
    return;
  }
  const grade = rubyGrade(seg.kanji);
  const showKanji = grade !== null && grade >= 1 && grade <= readingLevel;
  if (!showKanji) {
    parent.appendChild(document.createTextNode(seg.kana));
    return;
  }
  if (furigana) {
    const ruby = document.createElement('ruby');
    ruby.appendChild(document.createTextNode(seg.kanji));
    const rt = document.createElement('rt');
    rt.textContent = seg.kana;
    ruby.appendChild(rt);
    parent.appendChild(ruby);
  } else {
    parent.appendChild(document.createTextNode(seg.kanji));
  }
}

// elの中身をtextの表示結果（テキストノード＋<ruby>）で置き換える。data-ruby-textに元の文言を
// 保持し、よみレベル・ふりがなトグル変更時にrefreshRubyText()から再描画できるようにする。
export function renderInto(el, text, readingLevel, furigana) {
  el.dataset.rubyText = text;
  el.innerHTML = '';
  for (const seg of parseSegments(text)) {
    appendSegment(el, seg, readingLevel, furigana);
  }
}

// ふりがなトグル切替時に呼ぶ。現在画面上のルビ対象要素だけを再描画し、playステップの
// 命令キュー等それ以外のDOM状態は壊さない。
export function refreshRubyText(readingLevel, furigana) {
  document.querySelectorAll('[data-ruby-text]').forEach((el) => renderInto(el, el.dataset.rubyText, readingLevel, furigana));
}

export { KANJI_RE };
