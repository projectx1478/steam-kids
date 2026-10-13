// ヘッダー右上の歯車メニュー（Issue #389 段A）。
// 歯車（#gear-btn）→ メニュー（「ほごしゃの かた」「とじる」）→ 確認パネル（「すすむ」「やめる」）→ dashboard.html。
// 開いている間は全面の覆い（#menu-overlay）が盤面・じっこうボタンへのタップを受け止めるので、
// 実行ボタンは押せず、メニューは覆いのタップか「とじる」で閉じる。
// <dialog>は使わない（hiddenの切替のみ）。拡大の項目は段Bで足す。

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
    gear.setAttribute('aria-expanded', 'true');
  };

  gear.addEventListener('click', () => {
    if (menu.hidden) openMenu();
    else closeAll();
  });
  overlay.addEventListener('click', closeAll);
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
