// ヘッダー右上の歯車メニュー（Issue #389 段A）。
// 歯車（#gear-btn）→ メニュー（「ほごしゃの かた」「とじる」）→ 確認パネル（「すすむ」「やめる」）→ dashboard.html。
// 開いている間は全面の覆い（#menu-overlay）が盤面・じっこうボタンへのタップを受け止めるので、
// 実行ボタンは押せず、メニューは覆いのタップか「とじる」で閉じる。
// <dialog>は使わない（hiddenの切替のみ）。
// 拡大の3項目（#zoom-in・#zoom-out・#zoom-all）は、今の操作画面が拡大できる盤（24px未満）のときだけ出す（ui-zoom.js）。

import { getActiveZoom } from './ui-zoom.js';

const GUARDIAN_URL = 'dashboard.html';

function byId(id) {
  return document.getElementById(id);
}

export function initMenu() {
  const gear = byId('gear-btn');
  const menu = byId('gear-menu');
  const overlay = byId('menu-overlay');
  const confirmBox = byId('guardian-confirm');
  if (!gear || !menu || !overlay || !confirmBox) return;

  const zoomBox = byId('menu-zoom');
  const zoomIn = byId('zoom-in');
  const zoomOut = byId('zoom-out');
  const zoomAll = byId('zoom-all');
  // 拡大できない盤（24px以上）や選択画面では3項目を出さない。
  const refreshZoom = () => {
    const z = getActiveZoom();
    const on = !!z && z.enabled();
    zoomBox.hidden = !on;
    if (!on) return;
    zoomIn.disabled = z.scale() >= 3;
    zoomOut.disabled = z.scale() <= 1;
    zoomAll.disabled = z.scale() <= 1;
  };

  const closeAll = () => {
    menu.hidden = true;
    overlay.hidden = true;
    confirmBox.hidden = true;
    gear.setAttribute('aria-expanded', 'false');
  };
  const openMenu = () => {
    menu.hidden = false;
    overlay.hidden = false;
    confirmBox.hidden = true;
    refreshZoom();
    gear.setAttribute('aria-expanded', 'true');
  };

  gear.addEventListener('click', () => {
    if (menu.hidden) openMenu();
    else closeAll();
  });
  overlay.addEventListener('click', closeAll);
  // 倍率を変えたらメニューを閉じて、盤面の変わり方が見えるようにする。
  const zoomAction = (fn) => () => {
    const z = getActiveZoom();
    if (z) fn(z);
    closeAll();
  };
  zoomIn.addEventListener('click', zoomAction((z) => z.zoomIn()));
  zoomOut.addEventListener('click', zoomAction((z) => z.zoomOut()));
  zoomAll.addEventListener('click', zoomAction((z) => z.reset()));
  byId('menu-close').addEventListener('click', closeAll);
  byId('menu-guardian').addEventListener('click', () => {
    menu.hidden = true;
    overlay.hidden = true;
    confirmBox.hidden = false;
  });
  byId('guardian-cancel').addEventListener('click', closeAll);
  byId('guardian-go').addEventListener('click', () => {
    location.href = GUARDIAN_URL;
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAll();
  });
}
