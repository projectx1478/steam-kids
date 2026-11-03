// rollBalls（転がす球）・pits（おとし穴）ギミック（Issue #287）。ロボットが進む先に球があれば
// 同じ向きへ1マス転がし（1手）、転がし先が埋まっていないおとし穴なら球は穴に埋まる。
// 転がせない手（先が盤外・壁・他の球）と、埋まっていないおとし穴へ入る手は壁と同じ失敗。
// 状態：{ balls: [{x,y}|null], filled: [boolean] }（ballsは初期位置と同じ添字。穴に埋まった球はnull）。
// 描画（render）・演出（onStep・onBump）は段2。見た目は review/design/287/mock/balls-360.svg に合わせる。
const list = (v) => (Array.isArray(v) ? v : []);
const keyOf = (p) => `${p.x},${p.y}`;
const isPoint = (p) => p && Number.isInteger(p.x) && Number.isInteger(p.y);
const DELTA = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const MOVE_MS = 450; // ロボットの移動時間（js/ui-grid.js の MOVE_MS と同じ）
const FALL_MS = 300; // 穴に沈む時間（js/ui-grid.js の FALL_MS と同じ）
const BOUNCE_MS = 250; // 震える時間（js/ui-grid.js の BOUNCE_MS と同じ）
const SPIN = { right: 180, down: 180, left: -180, up: -180 };
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const svgLayer = (inner, extra = '') =>
  `<svg viewBox="0 0 64 64" class="absolute pointer-events-none" style="left:0;top:0;width:100%;height:100%;${extra}" aria-hidden="true">${inner}</svg>`;
// 球：影・回す本体（外周・本体・面・縫い目）・ハイライトの3層。回すのは本体だけ。
const BALL_SHADOW = '<ellipse cx="32" cy="57" rx="19" ry="5" fill="#1e293b" opacity="0.28" />';
const BALL_BODY = `<circle cx="32" cy="32" r="24" fill="#5b3416" />
  <circle cx="32" cy="30" r="23" fill="#c2701f" />
  <circle cx="30" cy="28" r="17" fill="#e08a2e" />
  <path d="M14 30 Q32 42 50 30" fill="none" stroke="#8a4a14" stroke-width="2.5" stroke-linecap="round" />
  <path d="M22 16 Q32 12 42 18" fill="none" stroke="#8a4a14" stroke-width="2.5" stroke-linecap="round" opacity="0.6" />`;
const BALL_LIGHT = '<ellipse cx="23" cy="20" rx="7" ry="4.5" fill="#fde1b0" opacity="0.75" transform="rotate(-30 23 20)" />';
const PIT_BASE = `<ellipse cx="32" cy="34" rx="26" ry="20" fill="#065f46" opacity="0.55" />
  <ellipse cx="32" cy="33" rx="24" ry="18" fill="#1e293b" />
  <ellipse cx="32" cy="36" rx="20" ry="13" fill="#0f172a" />`;
const PIT_SVG = svgLayer(`${PIT_BASE}<path d="M12 40 Q32 54 52 40" fill="none" stroke="#34d399" stroke-width="2" opacity="0.7" />`);
const FILLED_SVG = svgLayer(`${PIT_BASE}
  <path d="M10 33 A22 18 0 0 1 54 33 L54 35 A22 14 0 0 1 10 35 Z" fill="#5b3416" />
  <path d="M12 33 A20 16 0 0 1 52 33 A20 6 0 0 1 12 33 Z" fill="#c2701f" />
  <ellipse cx="32" cy="30" rx="14" ry="8" fill="#e08a2e" />
  <ellipse cx="26" cy="27" rx="6" ry="3" fill="#fde1b0" opacity="0.75" />`);
// 併用禁止（理由つき）。items・cushion・bridge・paint・keys・doors・water・repeatBox・groupRepeats は併用してよい（stageGen が混ぜるのは items・keys・water・paint だけ）。
const EXCLUDED = {
  ice: '1手に同じたまを2回押す',
  warps: '出口でたまを押す・1手に2球動く',
  switches: '転がしたあとそのマスが壁になり、たまだけ動く',
  groupWalls: '転がしたあとそのマスが壁になり、たまだけ動く',
  periodic: '転がしたあとそのマスが壁になり、たまだけ動く',
};
// たま・おとし穴を重ねられないギミック（穴が埋まる矛盾・ドアにたまが閉じ込められる）。
const NO_OVERLAP = ['water', 'doors', 'cushion'];

export const rollBalls = {
  key: 'rollBalls',
  label: '転がす球',

  initState(spec) {
    const balls = list(spec.rollBalls);
    if (balls.length === 0) return null;
    return {
      balls: balls.map((b) => (isPoint(b) ? { x: b.x, y: b.y } : null)),
      filled: list(spec.pits).map(() => false),
    };
  },

  enter(state) {
    return state;
  },

  isCleared() {
    return true;
  },

  // 例 "rb:2,1/0"：生きている球の位置を x,y の昇順で ; 連結 ＋ / ＋ 埋まった穴の添字ビット。
  stateKey(state) {
    if (!state) return '';
    const pos = state.balls
      .filter(Boolean)
      .sort((a, b) => a.x - b.x || a.y - b.y)
      .map(keyOf)
      .join(';');
    const bits = state.filled.reduce((sum, f, i) => (f ? sum + 2 ** i : sum), 0);
    return `rb:${pos}/${bits}`;
  },

  // 球のあるマスと、埋まっていないおとし穴。
  blocks(state, pos, spec) {
    if (!state) return false;
    if (state.balls.some((b) => b && b.x === pos.x && b.y === pos.y)) return true;
    return list(spec.pits).some((c, i) => c && c.x === pos.x && c.y === pos.y && !state.filled[i]);
  },

  // pos へ dir 向きで入る直前。球が無ければ null、動かせなければ { ok:false }、
  // 動かせたら { ok:true, state, move:{from,to,fill} }。1手で動かせるのは1球。
  roll(state, pos, dir, spec, isOpen) {
    if (!state) return null;
    const idx = state.balls.findIndex((b) => b && b.x === pos.x && b.y === pos.y);
    if (idx < 0) return null;
    const [dx, dy] = DELTA[dir];
    const to = { x: pos.x + dx, y: pos.y + dy };
    const pitIdx = list(spec.pits).findIndex((c, i) => c && c.x === to.x && c.y === to.y && !state.filled[i]);
    if (pitIdx < 0 && !isOpen(to)) return { ok: false };
    const balls = state.balls.slice();
    const filled = state.filled.slice();
    if (pitIdx >= 0) {
      balls[idx] = null;
      filled[pitIdx] = true;
    } else {
      balls[idx] = to;
    }
    return { ok: true, state: { balls, filled }, move: { from: { x: pos.x, y: pos.y }, to, fill: pitIdx >= 0 ? pitIdx : null } };
  },

  // 球は個別要素（data-roll-ball=添字。影・回す本体[data-roll-body]・ハイライトの3層）、
  // おとし穴はセルに重ねる（data-pit=添字。埋まると data-pit-filled="true"）。駒より下に積む。
  render({ board, pixelFor, CELL, rollBalls: balls, pits }) {
    const cellAt = (c) => board.querySelector(`.grid-cell[data-x="${c.x}"][data-y="${c.y}"]`);
    list(pits).forEach((c, i) => {
      const cell = isPoint(c) ? cellAt(c) : null;
      if (!cell) return;
      const el = document.createElement('div');
      el.className = 'grid-pit absolute pointer-events-none';
      el.style.cssText = 'left:0;top:0;width:100%;height:100%';
      el.dataset.pit = String(i);
      el.innerHTML = PIT_SVG;
      cell.appendChild(el);
    });
    list(balls).forEach((c, i) => {
      if (!isPoint(c)) return;
      const px = pixelFor(c);
      const el = document.createElement('div');
      el.className = 'grid-roll-ball absolute pointer-events-none';
      el.style.top = '0';
      el.style.left = '0';
      el.style.width = `${CELL}px`;
      el.style.height = `${CELL}px`;
      el.style.transform = `translate(${px.x}px, ${px.y}px)`;
      el.dataset.rollBall = String(i);
      el.dataset.rollX = String(c.x);
      el.dataset.rollY = String(c.y);
      el.innerHTML = `${svgLayer(BALL_SHADOW)}${svgLayer(BALL_BODY, 'transform-origin:50% 50%')}${svgLayer(BALL_LIGHT)}`;
      el.children[1].dataset.rollBody = '';
      board.appendChild(el);
    });
  },

  // result.rolls[index] を読み、球を1マス動かしながら180度回す。fill があれば移動後に沈めて埋まった穴へ替える。
  // reduced-motion では回転・沈みを省き、位置と穴の絵を即時に替える。
  onStep({ result, index }) {
    const move = result?.rolls?.[index];
    if (!move || !move.to) return;
    const el = [...document.querySelectorAll('[data-roll-ball]')].find((e) => e.dataset.rollX === String(move.from.x) && e.dataset.rollY === String(move.from.y));
    if (!el) return;
    const reduce = reduced();
    const dx = move.to.x - move.from.x;
    const dy = move.to.y - move.from.y;
    const dir = dx > 0 ? 'right' : dx < 0 ? 'left' : dy > 0 ? 'down' : 'up';
    const m = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(el.style.transform);
    const cellAt = (c) => document.querySelector(`.grid-cell[data-x="${c.x}"][data-y="${c.y}"]`);
    const cf = cellAt(move.from);
    const ct = cellAt(move.to);
    const ox = cf && ct ? ct.offsetLeft - cf.offsetLeft : 0;
    const oy = cf && ct ? ct.offsetTop - cf.offsetTop : 0;
    el.dataset.rollX = String(move.to.x);
    el.dataset.rollY = String(move.to.y);
    if (m) {
      el.style.transition = reduce ? 'none' : `transform ${MOVE_MS}ms ease`;
      el.style.transform = `translate(${Number(m[1]) + ox}px, ${Number(m[2]) + oy}px)`;
    }
    const body = el.querySelector('[data-roll-body]');
    if (body && !reduce) {
      const rot = Number(body.dataset.rot || 0) + SPIN[dir];
      body.dataset.rot = String(rot);
      body.style.transition = `transform ${MOVE_MS}ms linear`;
      body.style.transform = `rotate(${rot}deg)`;
    }
    if (move.fill === null || move.fill === undefined) return;
    const fillPit = () => {
      el.remove();
      const pit = document.querySelector(`[data-pit="${move.fill}"]`);
      if (!pit) return;
      pit.dataset.pitFilled = 'true';
      pit.innerHTML = FILLED_SVG;
    };
    if (reduce) {
      fillPit();
      return;
    }
    setTimeout(() => {
      if (!el.isConnected) return;
      el.animate([{ opacity: 1, scale: '1' }, { opacity: 0, scale: '0.3' }], { duration: FALL_MS, easing: 'ease-in', fill: 'forwards' });
      setTimeout(fillPit, FALL_MS);
    }, MOVE_MS);
  },

  // 動かせなかった球（target のマスにある球）を小さく震わせる。reduced-motion では何もしない。
  onBump({ target }) {
    if (!target || reduced()) return;
    const el = [...document.querySelectorAll('[data-roll-ball]')].find((e) => e.dataset.rollX === String(target.x) && e.dataset.rollY === String(target.y));
    if (!el) return;
    el.animate(
      [{ translate: '0 0' }, { translate: '-3px 0', offset: 0.2 }, { translate: '3px 0', offset: 0.4 }, { translate: '-2px 0', offset: 0.6 }, { translate: '2px 0', offset: 0.8 }, { translate: '0 0' }],
      { duration: BOUNCE_MS }
    );
  },

  // 必須性の比較用：球を外し、おとし穴を壁にした盤。
  strip(spec) {
    return { ...spec, rollBalls: [], walls: [...list(spec.walls), ...list(spec.pits)], pits: [] };
  },

  // 座標範囲・個数・重なり・併用を見る（paint・periodic と同じくここで整数・盤内も検査する）。
  validate(board, add, label) {
    const has = (v) => (Array.isArray(v) ? v.length > 0 : v !== undefined && v !== null);
    if (!has(board.rollBalls) && !has(board.pits)) return;
    const NAME = '盤面の妥当性';
    for (const k of ['rollBalls', 'pits']) {
      if (board[k] !== undefined && !Array.isArray(board[k])) add(NAME, `${label}${k} が配列でない`);
    }
    const balls = list(board.rollBalls);
    const pits = list(board.pits);
    if (balls.length > 2) add(NAME, `${label}rollBalls が3個以上（${balls.length}個。2個まで）`);
    if (pits.length > balls.length && balls.length > 0) add(NAME, `${label}pits が rollBalls より多い（pits ${pits.length}個・rollBalls ${balls.length}個）`);
    if (balls.length > 0 && pits.length === 0) add(NAME, `${label}rollBalls があるのに pits が空`);
    if (pits.length > 0 && balls.length === 0) add(NAME, `${label}pits があるのに rollBalls が空`);

    const grid = board.grid || {};
    const set = (pts) => new Set(list(pts).filter(isPoint).map(keyOf));
    const walls = set(board.walls);
    const start = board.start ? set([board.start]) : new Set();
    const goal = board.goal ? set([board.goal]) : new Set();
    const check = (kind, points, other, otherName) => {
      const seen = new Set();
      points.forEach((c, i) => {
        if (!isPoint(c)) {
          add(NAME, `${label}${kind}[${i}] が整数の{x,y}でない`);
          return;
        }
        if (c.x < 0 || c.y < 0 || c.x >= grid.cols || c.y >= grid.rows) add(NAME, `${label}${kind}[${i}]=${JSON.stringify(c)} が盤外`);
        if (seen.has(keyOf(c))) add(NAME, `${label}${kind}[${i}] が他の${kind}と座標重複`);
        seen.add(keyOf(c));
        for (const [name, s] of [['壁', walls], ['start', start], ['goal', goal], [otherName, other]]) {
          if (s.has(keyOf(c))) add(NAME, `${label}${kind}[${i}] が${name}と重なる`);
        }
      });
    };
    check('rollBalls', balls, set(pits), 'pits');
    check('pits', pits, set(balls), 'rollBalls');

    for (const [k, why] of Object.entries(EXCLUDED)) {
      if (has(board[k])) add(NAME, `${label}rollBalls・pits と ${k} は同じ盤に置けない（${why}）`);
    }
    for (const k of NO_OVERLAP) {
      const cells = set(board[k]);
      for (const [kind, points] of [['rollBalls', balls], ['pits', pits]]) {
        points.forEach((c, i) => {
          if (isPoint(c) && cells.has(keyOf(c))) add(NAME, `${label}${kind}[${i}] が ${k} のマスと重なる`);
        });
      }
    }
  },
};
