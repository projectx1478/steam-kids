// 小鳥（かんむりルリ）の顔アイコンと吹き出しの器（Issue #468 段1）。
// 中身（文言・表示条件）は段2・3。ここは置き場と出し入れだけ。位置・寸法は tailwind.src.css の sk-bird-*。
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

// createBird(boardArea): 盤面の角に顔アイコン（見た目40px・押せる範囲64px）と空の吹き出しを足す。
// 戻り値の iconEl はタップで反応を付ける側（段2）が onclick を足す。showBubble/hideBubble は出し入れのみ。
export function createBird(boardArea) {
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

  boardArea.appendChild(bubbleEl);
  boardArea.appendChild(iconEl);

  function hideBubble() {
    bubbleEl.hidden = true;
    bubbleEl.textContent = '';
  }
  // text は呼び出し側が渡す（textContent で入れる）。すでに出ていれば置き換える。
  function showBubble(text) {
    bubbleEl.textContent = text;
    bubbleEl.hidden = false;
  }
  // 吹き出し自体のタップで消える（自動では消さない。#468 悠 10-18）。
  bubbleEl.addEventListener('click', hideBubble);

  return { iconEl, bubbleEl, showBubble, hideBubble, isBubbleShown: () => !bubbleEl.hidden };
}
