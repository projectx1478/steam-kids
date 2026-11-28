// sort-order（レシピの順番）の台所の場面（Issue #823）。画風は C（ぷっくり立体。グラデーションと光・細い線 #334155。Issue #824）。
// 1枚の SVG（viewBox 240×160）に壁・棚・調理台・コンロ・鍋・ロボット・吹き出しを描き、手順ごとに具材を足し、結果は失敗の種類ごとに動かす。
// DOM の生成は ui-sortorder.js 側。ここは文字列（sceneSvg）・具材を足す関数・結果の動き（animateScene。Web Animations の配列を返す）だけ。
const INK = '#1e293b'; // ロボットの線（絵そのものは変えない）
const LINE = '#334155'; // 場面の線
const POT_BODY = 'M110 72h80v30q0 10-10 10h-60q-10 0-10-10z';
const NS = 'http://www.w3.org/2000/svg';
const FILL_BOX = 'transform-box:fill-box;transform-origin:center';

// 結果の種類。ui-sortorder.js の kind は FAILS（burn/spill/raw/empty）・none・ok のどれか。
export const SCENE_KINDS = ['ok', 'burn', 'spill', 'raw', 'empty', 'none'];

const steam = [134, 150, 166]
  .map((x) => `<path data-p="steam" d="M${x} 58c-7-7 7-12 0-22" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" style="${FILL_BOX};opacity:0"/>`)
  .join('');
const smoke = [[138, 48, 11], [156, 40, 14], [172, 50, 10]]
  .map(([x, y, r]) => `<circle data-p="smoke" cx="${x}" cy="${y}" r="${r}" fill="url(#so-smoke)" style="${FILL_BOX};opacity:0"/>`)
  .join('');
const star = (x, y, r) =>
  `<path data-p="spark" d="M${x} ${y - r}Q${x} ${y} ${x + r} ${y}Q${x} ${y} ${x} ${y + r}Q${x} ${y} ${x - r} ${y}Q${x} ${y} ${x} ${y - r}Z" fill="#fde047" stroke="#f59e0b" stroke-width="1.5" style="${FILL_BOX};opacity:0"/>`;

// playerSvg＝shapeSvg('player') の文字列（呼び出し側が渡す。DOM に触れない）。
export function sceneSvg(playerSvg) {
  const flame =
    `<g data-p="flame" style="transform-box:fill-box;transform-origin:center bottom;opacity:0"><ellipse cx="150" cy="112" rx="40" ry="10" fill="url(#so-glow)"/><path d="M122 116c2-8 6-6 6-12 4 5 6 8 4 12zM144 116c2-9 6-7 6-14 5 6 7 9 4 14zM168 116c2-8 6-6 6-12 4 5 6 8 4 12z" fill="url(#so-fl)"/></g>`;
  const pot =
    `<g data-p="pot" style="transform-box:view-box;transform-origin:190px 112px">` +
    `<rect x="98" y="77" width="14" height="10" rx="5" fill="${LINE}"/><rect x="188" y="77" width="14" height="10" rx="5" fill="${LINE}"/>` +
    `<path d="${POT_BODY}" fill="url(#so-pot)" stroke="${LINE}" stroke-width="1.5"/>` +
    `<path d="M118 80q-2 14 2 26" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity="0.9"/>` +
    `<path data-p="char" d="${POT_BODY}" fill="#1c1917" style="opacity:0"/>` +
    `<ellipse cx="150" cy="72" rx="42" ry="8" fill="url(#so-rim)" stroke="${LINE}" stroke-width="1.5"/>` +
    `<ellipse cx="150" cy="73" rx="35" ry="5" fill="#334155"/>` +
    `<ellipse data-p="soup" cx="150" cy="73" rx="35" ry="5" fill="url(#so-soup)" style="${FILL_BOX};opacity:0"/>` +
    `<g data-p="ins"></g>` +
    `<g data-p="lid" style="${FILL_BOX};opacity:0"><path d="M110 70a40 18 0 0 1 80 0z" fill="url(#so-rim)" stroke="${LINE}" stroke-width="1.5"/><circle cx="150" cy="48" r="4" fill="${LINE}"/></g>` +
    `</g>`;
  const robot =
    `<g class="so-robot" data-p="robot" style="transform-box:fill-box;transform-origin:center bottom">` +
    `<svg x="14" y="68" width="76" height="86" viewBox="0 -8 64 72" overflow="visible">${playerSvg}` +
    `<path d="M18 8c-6-2-4-12 4-11 3-6 17-6 20 0 8-1 10 9 4 11z" fill="#fff" stroke="${INK}" stroke-width="2"/></svg></g>`;
  const bubble =
    `<g data-p="bubble" style="${FILL_BOX};opacity:0"><path d="M62 54a8 8 0 0 1 8-8h28a8 8 0 0 1 8 8v14a8 8 0 0 1-8 8H84l-8 7 1-7h-7a8 8 0 0 1-8-8z" fill="#fff" stroke="${LINE}" stroke-width="1.5"/>` +
    `<text x="84" y="68" text-anchor="middle" font-size="20" font-weight="800" fill="${INK}"></text></g>` +
    `<path data-p="sweat" d="M92 92q-5 7 0 9 5-2 0-9z" fill="#7dd3fc" stroke="${LINE}" stroke-width="1.5" style="${FILL_BOX};opacity:0"/>`;
  const spill =
    `<path data-p="stream" d="M211 82q10 12 12 38" fill="none" stroke="#fbbf24" stroke-width="7" stroke-linecap="round" style="stroke-dasharray:70;stroke-dashoffset:70;opacity:0"/>` +
    `<circle data-p="drops" cx="216" cy="92" r="3" fill="#fbbf24" style="${FILL_BOX};opacity:0"/><circle data-p="drops" cx="226" cy="98" r="2.5" fill="#fbbf24" style="${FILL_BOX};opacity:0"/>` +
    `<ellipse data-p="puddle" cx="222" cy="127" rx="18" ry="4" fill="#fbbf24" stroke="#b45309" stroke-width="1.5" style="transform-box:fill-box;transform-origin:left center;opacity:0"/>`;
  return (
    `<svg class="so-scene" viewBox="0 0 240 160" preserveAspectRatio="xMidYMid meet" aria-hidden="true" data-scene="idle">` +
    `<defs>` +
    `<linearGradient id="so-wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff7ed"/><stop offset="1" stop-color="#fed7aa"/></linearGradient>` +
    `<linearGradient id="so-ctr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fdba74"/><stop offset="1" stop-color="#c2410c"/></linearGradient>` +
    `<linearGradient id="so-pot" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#64748b"/><stop offset=".18" stop-color="#f8fafc"/><stop offset=".45" stop-color="#cbd5e1"/><stop offset="1" stop-color="#334155"/></linearGradient>` +
    `<linearGradient id="so-rim" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f1f5f9"/><stop offset="1" stop-color="#94a3b8"/></linearGradient>` +
    `<radialGradient id="so-soup" cx=".4" cy=".35" r=".8"><stop offset="0" stop-color="#fef3c7"/><stop offset=".5" stop-color="#fbbf24"/><stop offset="1" stop-color="#d97706"/></radialGradient>` +
    `<radialGradient id="so-fl" cx=".5" cy=".8" r=".7"><stop offset="0" stop-color="#fef08a"/><stop offset=".5" stop-color="#fb923c"/><stop offset="1" stop-color="#ef4444"/></radialGradient>` +
    `<radialGradient id="so-glow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fb923c" stop-opacity=".55"/><stop offset="1" stop-color="#fb923c" stop-opacity="0"/></radialGradient>` +
    `<radialGradient id="so-smoke" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#94a3b8"/><stop offset="1" stop-color="#334155"/></radialGradient>` +
    `<filter id="so-blur"><feGaussianBlur stdDeviation="3"/></filter></defs>` +
    `<rect data-p="wall" width="240" height="160" fill="url(#so-wall)"/>` +
    `<circle cx="40" cy="30" r="18" fill="#fff" opacity=".5"/><circle cx="210" cy="22" r="12" fill="#fff" opacity=".45"/><circle cx="72" cy="60" r="8" fill="#fff" opacity=".4"/>` +
    `<g data-p="shelf"><rect x="10" y="38" width="66" height="6" rx="2" fill="#b45309" stroke="${LINE}" stroke-width="1.5"/>` +
    `<rect x="16" y="22" width="14" height="16" rx="3" fill="#fde68a" stroke="${LINE}" stroke-width="1.5"/><rect x="34" y="18" width="16" height="20" rx="3" fill="#fecaca" stroke="${LINE}" stroke-width="1.5"/><rect x="54" y="24" width="14" height="14" rx="3" fill="#bbf7d0" stroke="${LINE}" stroke-width="1.5"/></g>` +
    `<g data-p="counter"><rect x="0" y="120" width="240" height="40" fill="url(#so-ctr)"/><rect x="0" y="120" width="240" height="4" fill="#fff" opacity=".45"/></g>` +
    `<ellipse cx="150" cy="122" rx="56" ry="6" fill="#7c2d12" opacity=".45" filter="url(#so-blur)"/><ellipse cx="52" cy="150" rx="26" ry="5" fill="#7c2d12" opacity=".35" filter="url(#so-blur)"/>` +
    `<g data-p="stove"><rect x="102" y="114" width="96" height="10" rx="5" fill="#1f2937"/><rect x="104" y="115" width="92" height="3" rx="1.5" fill="#4b5563"/>` +
    `<circle cx="122" cy="142" r="6" fill="#e2e8f0" stroke="${LINE}" stroke-width="1.5"/><circle cx="178" cy="142" r="6" fill="#e2e8f0" stroke="${LINE}" stroke-width="1.5"/></g>` +
    `${flame}${pot}${steam}${smoke}${star(112, 48, 9)}${star(194, 44, 11)}${star(206, 82, 7)}${spill}${robot}${bubble}` +
    `</svg>`
  );
}

// 鍋に具材を1つ足す。i＝0始まりの手の番号、total＝カードの枚数。soup は1手目で出て、手が進むごとに少し大きくなる。
export function addIngredient(svg, i, icon, total) {
  const soup = svg.querySelector('[data-p="soup"]');
  soup.style.opacity = '1';
  soup.style.transform = `scale(${(0.4 + (0.6 * (i + 1)) / total).toFixed(3)})`;
  const t = document.createElementNS(NS, 'text');
  t.setAttribute('class', 'so-in');
  t.setAttribute('x', String(124 + i * 13));
  t.setAttribute('y', '74');
  t.setAttribute('font-size', '14');
  t.setAttribute('text-anchor', 'middle');
  t.setAttribute('style', FILL_BOX);
  t.textContent = icon;
  svg.querySelector('[data-p="ins"]').appendChild(t);
  return t;
}

export function lightFlame(svg) {
  svg.querySelector('[data-p="flame"]').style.opacity = '1';
}

// 結果の種類ごとの終端の状態（インラインのスタイル）。動きは animateScene が fill:'backwards' で重ねるので、finish() 後・動きを減らす設定ではこの状態が残る。
const TERMINAL = {
  ok: { steam: { opacity: '0.95' }, spark: { opacity: '1', transform: 'scale(1) rotate(45deg)' } },
  burn: { flame: { opacity: '1', transform: 'scale(1.6)' }, char: { opacity: '0.85' }, smoke: { opacity: '0.92' }, sweat: { opacity: '1' } },
  spill: {
    pot: { transform: 'rotate(30deg)' },
    stream: { opacity: '1', strokeDashoffset: '0' },
    drops: { opacity: '1' },
    puddle: { opacity: '1' },
    robot: { transform: 'translate(-8px, -4px) rotate(-6deg)' },
  },
  raw: { soup: { fill: '#fecdd3' } },
  empty: { lid: { opacity: '1', transform: 'translateY(-16px) rotate(-14deg)' }, soup: { opacity: '0' }, ins: { opacity: '0' } },
  none: {},
};

// 結果の場面を作る。svg に種類と吹き出しの文字を入れて終端の状態にし、動き（Web Animations）の配列を返す。a.finish() で終端になる。
// 繰り返しは有限回（Infinity は finish() で例外になる）。
export function animateScene(svg, kind) {
  const k = TERMINAL[kind] ? kind : 'none';
  svg.dataset.scene = k;
  const q = (p) => [...svg.querySelectorAll(`[data-p="${p}"]`)];
  for (const [p, st] of Object.entries(TERMINAL[k])) q(p).forEach((el) => Object.assign(el.style, st));
  if (k !== 'ok') {
    const b = svg.querySelector('[data-p="bubble"]');
    b.querySelector('text').textContent = k === 'spill' ? '！' : '？';
    b.style.opacity = '1';
  }
  const all = [];
  const add = (p, frames, ms, delay = 0, extra = {}, stagger = 0) =>
    q(p).forEach((el, i) => all.push(el.animate(frames, { duration: ms, delay: delay + i * stagger, fill: 'backwards', easing: 'ease-in-out', ...extra })));
  const pop = (delay) => add('bubble', [{ opacity: 0, transform: 'scale(0)' }, { opacity: 1, transform: 'scale(1)' }], 350, delay, { easing: 'cubic-bezier(.3, 1.7, .5, 1)' });
  const sweat = (delay) => add('sweat', [{ opacity: 0, transform: 'translateY(-4px)' }, { opacity: 1, offset: 0.3 }, { opacity: 0, transform: 'translateY(10px)' }], 900, delay, { iterations: 2, easing: 'ease-in' });
  if (k === 'ok') {
    add('steam', [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 0.95, offset: 0.3 }, { opacity: 0, transform: 'translateY(-18px)' }], 1000, 0, { iterations: 2, easing: 'ease-out' }, 250);
    add('spark', [{ opacity: 0, transform: 'scale(0) rotate(0deg)' }, { opacity: 1, transform: 'scale(1.35) rotate(30deg)', offset: 0.6 }, { opacity: 1, transform: 'scale(1) rotate(45deg)' }], 600, 100, { easing: 'ease-out' }, 150);
    add('robot', [{ transform: 'translateY(0)' }, { transform: 'translateY(-12px)' }, { transform: 'translateY(0)' }], 450, 100, { iterations: 2, easing: 'ease-out' });
  } else if (k === 'burn') {
    add('flame', [{ opacity: 1, transform: 'scale(1)' }, { opacity: 1, transform: 'scale(1.6)' }], 500, 0, { easing: 'ease-out' });
    add('char', [{ opacity: 0 }, { opacity: 0.85 }], 1000, 300, { easing: 'ease-in' });
    add('smoke', [{ opacity: 0, transform: 'translateY(8px) scale(0.5)' }, { opacity: 0.92, offset: 0.25 }, { opacity: 0, transform: 'translateY(-34px) scale(1.6)' }], 1000, 500, { iterations: 2, easing: 'ease-out' }, 250);
    add('pot', [{ transform: 'translateX(-2.5px)' }, { transform: 'translateX(2.5px)' }], 70, 500, { iterations: 10, direction: 'alternate', easing: 'linear' });
    add('robot', [{ transform: 'rotate(0deg)' }, { transform: 'rotate(-7deg)', offset: 0.25 }, { transform: 'rotate(7deg)', offset: 0.75 }, { transform: 'rotate(0deg)' }], 500, 600, { iterations: 2 });
    pop(600);
    sweat(700);
  } else if (k === 'spill') {
    add('pot', [{ transform: 'rotate(0deg)' }, { transform: 'rotate(30deg)' }], 600, 0, { easing: 'cubic-bezier(.4, 1.6, .6, 1)' });
    add('stream', [{ opacity: 1, strokeDashoffset: 70 }, { opacity: 1, strokeDashoffset: 0 }], 500, 400, { easing: 'ease-in' });
    add('drops', [{ opacity: 1, transform: 'translateY(0)' }, { opacity: 0, transform: 'translateY(26px)' }], 600, 500, { iterations: 2, easing: 'ease-in' });
    add('puddle', [{ opacity: 1, transform: 'scaleX(0)' }, { opacity: 1, transform: 'scaleX(1)' }], 700, 700, { easing: 'ease-out' });
    add('robot', [{ transform: 'translate(0, 0) rotate(0deg)' }, { transform: 'translate(-8px, -4px) rotate(-6deg)' }], 400, 300, { easing: 'ease-out' });
    pop(300);
  } else if (k === 'raw') {
    add('soup', [{ fill: '#fbbf24' }, { fill: '#fecdd3' }], 500, 0);
    add('ins', [{ transform: 'translateY(0)' }, { transform: 'translateY(-4px)' }, { transform: 'translateY(0)' }], 900, 300, { iterations: 2 });
    pop(300);
  } else if (k === 'empty') {
    add('soup', [{ opacity: 1 }, { opacity: 0 }], 300);
    add('ins', [{ opacity: 1 }, { opacity: 0 }], 300);
    add('lid', [{ opacity: 1, transform: 'translateY(0) rotate(0deg)' }, { opacity: 1, transform: 'translateY(-16px) rotate(-14deg)' }], 800, 300);
    pop(300);
  } else {
    add('pot', [{ transform: 'translateX(0)' }, { transform: 'translateX(-3px)' }, { transform: 'translateX(3px)' }, { transform: 'translateX(0)' }], 700, 100);
    pop(300);
  }
  return all;
}
