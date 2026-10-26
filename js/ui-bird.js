// 小鳥（かんむりルリ）の顔アイコンと吹き出しの器（Issue #468 段1）。
// 中身（文言・表示条件）は段2・3。ここは置き場と出し入れだけ。位置・寸法は tailwind.src.css の sk-bird-*。
// 顔と吹き出しは盤面の上の固定の欄（laneEl。高さ64px。Issue #544 段1）に並べる。吹き出しは1行表示で、収まらない文は横にスライドして見せる。
const SVG_NS = 'http://www.w3.org/2000/svg';

function createFaceSvg() {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '16 72 120 120');
  svg.setAttribute('width', '40');
  svg.setAttribute('height', '40');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML =
    '<circle cx="88" cy="150" r="42" fill="#4fd1a1" stroke="#1d7f5e" stroke-width="4"/>' +
    '<circle cx="76" cy="144" r="9" fill="#2b2b2b"/><circle cx="73" cy="141" r="3" fill="#fff"/>' +
    '<path d="M50 152 L22 160 L50 170 Z" fill="#ff8a1f" stroke="#d96a00" stroke-width="3" stroke-linejoin="round"/>' +
    '<path d="M88 110 Q92 84 104 80 M80 112 Q74 86 62 84 M96 112 Q112 92 128 96" stroke="#1d7f5e" stroke-width="6" fill="none" stroke-linecap="round"/>';
  return svg;
}

const SLIDE_PX = 8; // 指（pointer）がこれ以上動いたらスライド（吹き出しは消えない）。未満はタップ。
let nudged = false; // 続きのある吹き出しが初めて出たとき1回だけ「流れて戻る」合図（セッション内1回）

// createBird(laneEl, boardArea): 欄に顔アイコン（見た目40px・押せる範囲64px）と空の吹き出しを足す。
// boardArea は「スタート！」表示（data-start-cue）の監視だけに使う。
// 戻り値の iconEl はタップで反応を付ける側（段2）が onclick を足す。showBubble/hideBubble は出し入れのみ。
export function createBird(laneEl, boardArea) {
  const iconEl = document.createElement('button');
  iconEl.type = 'button';
  iconEl.className = 'sk-bird-icon';
  iconEl.dataset.skBird = 'icon';
  iconEl.setAttribute('aria-label', 'ことり');
  iconEl.appendChild(createFaceSvg());

  const bubbleEl = document.createElement('div');
  bubbleEl.className = 'sk-bird-bubble';
  bubbleEl.dataset.skBird = 'bubble';
  bubbleEl.hidden = true;
  // 文が入る横スライドの枠（1行表示。はみ出しは隠してスライドで見せる）
  const trackEl = document.createElement('div');
  trackEl.className = 'sk-bird-track';
  bubbleEl.appendChild(trackEl);

  laneEl.appendChild(bubbleEl);
  laneEl.appendChild(iconEl);

  // 「スタート！」表示中（boardArea の data-start-cue）に来た text は保留し、消えた時点で最後の1件だけ出す（後勝ち）。
  let pending = null;
  let attrKeys = [];
  let nudgeId = 0;
  function hideBubble() {
    pending = null;
    nudgeId += 1;
    trackEl.scrollLeft = 0; // hidden にした後では無視されるので、先に戻す（#560）
    bubbleEl.hidden = true;
    trackEl.textContent = '';
    delete bubbleEl.dataset.more;
    attrKeys.forEach((k) => delete bubbleEl.dataset[k]);
    attrKeys = [];
  }

  const overflow = () => trackEl.scrollWidth - trackEl.clientWidth;
  // 続く側（右端）に白いぼかしと「▶」を出す。末尾に着くと消える（CSS の [data-more]）。
  function updateMore() {
    if (!bubbleEl.hidden && overflow() > 1 && trackEl.scrollLeft + trackEl.clientWidth < trackEl.scrollWidth - 1) {
      bubbleEl.dataset.more = 'true';
    } else {
      delete bubbleEl.dataset.more;
    }
  }
  trackEl.addEventListener('scroll', updateMore);

  // 初回の合図：文が約0.6秒少し流れて戻る。動きを減らす設定では出さない。
  function nudge() {
    const dist = Math.min(overflow(), 40);
    if (dist <= 0 || typeof requestAnimationFrame !== 'function') return;
    if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const id = ++nudgeId;
    const start = performance.now();
    const DUR = 600;
    const step = (now) => {
      if (id !== nudgeId || bubbleEl.hidden) return;
      const t = Math.min(1, (now - start) / DUR);
      trackEl.scrollLeft = dist * Math.sin(Math.PI * t);
      if (t < 1) requestAnimationFrame(step);
      else trackEl.scrollLeft = 0;
    };
    requestAnimationFrame(step);
  }

  // content は文字列（textContent で入れる）または DOM ノード（結果・ヒントの中身。Issue #497）。
  // attrs は吹き出しの data 属性（例 { result: 'clear' }）。すでに出ていれば置き換える（後勝ち）。
  function showBubble(content, attrs = {}) {
    if (boardArea.dataset.startCue) {
      pending = { content, attrs };
      return;
    }
    hideBubble();
    if (typeof content === 'string') trackEl.textContent = content;
    else trackEl.appendChild(content);
    Object.entries(attrs).forEach(([k, v]) => {
      bubbleEl.dataset[k] = v;
    });
    attrKeys = Object.keys(attrs);
    bubbleEl.hidden = false;
    updateMore();
    if (!nudged && bubbleEl.dataset.more === 'true') {
      nudged = true;
      nudge();
    }
  }
  if (typeof ResizeObserver === 'function') {
    new ResizeObserver(() => updateMore()).observe(laneEl);
  }
  boardArea.addEventListener('sk-start-cue-end', () => {
    if (pending !== null) showBubble(pending.content, pending.attrs);
  });

  // 横スライド：pointer が SLIDE_PX 以上動いたらスライド（click を無視＝消えない）。未満はタップ。
  let down = null;
  let slid = false;
  bubbleEl.addEventListener('pointerdown', (e) => {
    down = { x: e.clientX, left: trackEl.scrollLeft, id: e.pointerId };
    slid = false;
    nudgeId += 1; // 合図の動きは指が触れたら止める
  });
  bubbleEl.addEventListener('pointermove', (e) => {
    if (!down || e.pointerId !== down.id) return;
    const dx = e.clientX - down.x;
    if (!slid && Math.abs(dx) < SLIDE_PX) return;
    if (!slid) {
      slid = true;
      try {
        bubbleEl.setPointerCapture(e.pointerId);
      } catch {
        // キャプチャできなくてもスライド自体は動く
      }
    }
    trackEl.scrollLeft = down.left - dx;
  });
  const endPointer = () => {
    down = null;
  };
  bubbleEl.addEventListener('pointerup', endPointer);
  bubbleEl.addEventListener('pointercancel', endPointer);
  // 吹き出し自体のタップで消える（自動では消さない。#468 悠 10-18）。スライドの後の click は無視する。
  bubbleEl.addEventListener('click', () => {
    if (slid) {
      slid = false;
      return;
    }
    hideBubble();
  });

  return { iconEl, bubbleEl, showBubble, hideBubble, isBubbleShown: () => !bubbleEl.hidden };
}
