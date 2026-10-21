// 設定メニュー（Issue #389 段A・#467 段A）。
// ⚙（ヘッダの #gear-btn、のちにパレットの ⚙）→ 画面中央のパネル #gear-menu →
// 確認パネル（「すすむ」「やめる」）→ dashboard.html。
// 開いている間は全面の覆い（#menu-overlay）が盤面・じっこうボタンへのタップを受け止めるので、
// 実行ボタンは押せず、メニューは覆いのタップか「とじる」で閉じる。
// <dialog>は使わない（hiddenの切替のみ）。
// 「がめん」（#menu-zoom-open）は、今の操作画面が拡大できる盤（24px未満）のときだけ出す（ui-zoom.js）。
// 押すとパネルと覆いを閉じて画面下のズームバー（#zoom-bar。覆いなし）を開く。
// バーの おおきく・ちいさく・ぜんぶみる（#zoom-in・#zoom-out・#zoom-all）は倍率を変えてもバーを閉じず、
// もどる（#zoom-back）か Esc で閉じる。

import { getActiveZoom } from './ui-zoom.js';

const GUARDIAN_URL = 'dashboard.html';

function byId(id) {
  return document.getElementById(id);
}

let openImpl = null;

// 中央パネルを開く。opener は開いたボタン（aria-expanded を付ける先）。
export function openMenu(opener) {
  if (openImpl) openImpl(opener);
}

export function initMenu() {
  const gear = byId('gear-btn');
  const menu = byId('gear-menu');
  const overlay = byId('menu-overlay');
  const confirmBox = byId('guardian-confirm');
  if (!gear || !menu || !overlay || !confirmBox) return;

  const zoomBox = byId('menu-zoom');
  const zoomOpen = byId('menu-zoom-open');
  const bar = byId('zoom-bar');
  const zoomIn = byId('zoom-in');
  const zoomOut = byId('zoom-out');
  const zoomAll = byId('zoom-all');
  const zoomBack = byId('zoom-back');
  const menuMain = byId('menu-main');
  const creditOpen = byId('menu-credit-open');
  const creditView = byId('menu-credit-view');
  const creditClose = byId('menu-credit-close');
  const creditGuardian = byId('menu-credit-guardian');
  if (!menuMain || !creditOpen || !creditView || !creditClose || !creditGuardian) return;
  let opener = gear;

  // 拡大できない盤（24px以上）や選択画面では「がめん」を出さない。
  const refreshZoom = () => {
    const z = getActiveZoom();
    zoomBox.hidden = !(z && z.enabled());
  };
  // バー内の有効・無効。拡大できなくなった（画面が替わった等）らバーを閉じる。
  const refreshBar = () => {
    if (bar.hidden) return;
    const z = getActiveZoom();
    if (!z || !z.enabled()) {
      bar.hidden = true;
      return;
    }
    zoomIn.disabled = z.scale() >= 3;
    zoomOut.disabled = z.scale() <= 1;
    zoomAll.disabled = z.scale() <= 1;
  };

  const closeBar = () => {
    bar.hidden = true;
  };
  const showCredit = (show) => {
    menuMain.hidden = show;
    creditView.hidden = !show;
  };
  const closeAll = () => {
    menu.hidden = true;
    overlay.hidden = true;
    confirmBox.hidden = true;
    showCredit(false);
    opener.setAttribute('aria-expanded', 'false');
    gear.setAttribute('aria-expanded', 'false');
  };
  openImpl = (btn) => {
    opener = btn || gear;
    closeBar();
    menu.hidden = false;
    overlay.hidden = false;
    confirmBox.hidden = true;
    refreshZoom();
    opener.setAttribute('aria-expanded', 'true');
  };

  gear.addEventListener('click', () => {
    if (menu.hidden) openMenu(gear);
    else closeAll();
  });
  overlay.addEventListener('click', closeAll);
  // 点列ノード・まえ・えらぶ を押したらパネルを閉じる（遷移の処理は ui-step.js が行う）。
  menu.addEventListener('click', (e) => {
    if (e.target.closest('#menu-back, #menu-home, button.step-dot')) closeAll();
  });

  // 「がめん」：パネルを閉じて、盤面を見ながら調節できるズームバーへ。
  zoomOpen.addEventListener('click', () => {
    closeAll();
    bar.hidden = false;
    refreshBar();
  });
  const barAction = (fn) => () => {
    const z = getActiveZoom();
    if (z) fn(z);
    refreshBar();
  };
  zoomIn.addEventListener('click', barAction((z) => z.zoomIn()));
  zoomOut.addEventListener('click', barAction((z) => z.zoomOut()));
  zoomAll.addEventListener('click', barAction((z) => z.reset()));
  zoomBack.addEventListener('click', closeBar);
  // 画面が替わったとき（再描画）にバーの状態を合わせる。
  const stage = byId('stage');
  if (stage && typeof MutationObserver !== 'undefined') {
    new MutationObserver(refreshBar).observe(stage, { childList: true });
  }

  byId('menu-close').addEventListener('click', closeAll);
  // 「クレジット」：パネルを「BGM: MusMus」の表示に差し替える（外部リンクなし。Issue #378 段2）。
  creditOpen.addEventListener('click', () => showCredit(true));
  creditClose.addEventListener('click', closeAll);
  const openGuardian = () => {
    menu.hidden = true;
    overlay.hidden = true;
    confirmBox.hidden = false;
  };
  byId('menu-guardian').addEventListener('click', openGuardian);
  creditGuardian.addEventListener('click', openGuardian);
  byId('guardian-cancel').addEventListener('click', closeAll);
  byId('guardian-go').addEventListener('click', () => {
    location.href = GUARDIAN_URL;
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeAll();
      closeBar();
    }
  });
}
