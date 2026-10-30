// 操作画面のキー操作（Issue #380）。document の keydown を1本だけ持ち、画面ごとに登録・解除する。
// 矢印4種＝命令を足す（add）、Enter＝じっこう（run）、Backspace＝ひとつけす（removeLast）。
// Space・数字・Escape は扱わない（Escape は js/ui-menu.js の closeAll・closeBar 専用）。
//
// registerKeys({ add, run, removeLast, isBlocked, getButtons }) → 解除関数
//   add(dir)          : dir は 'up'|'down'|'left'|'right'。矢印の長押しは連続で呼ぶ。
//   run() / removeLast(): Enter・Backspace（e.repeat は無視）。呼び出し側は対応ボタンの .click() に委譲する想定。
//   isBlocked()       : 真の間は全キーを無視（実行中・stepping・クリア演出中・メニュー/ダイアログ表示中など）。
//   getButtons()      : 省略可。{ up, down, left, right, run, removeLast } のボタン要素を返す。
//                       対応ボタンが disabled なら add・run・removeLast を呼ばない（上限到達・実行中の事前判定）。
// 入力欄（INPUT/TEXTAREA/SELECT/contenteditable）にフォーカスがあるときは何もしない。
// 命令ボタン（[data-command]）または run ボタンにフォーカスがある Enter は、ボタン本来の動作
// （click）を止めて run を呼ぶ。それ以外のボタン上の Enter は本来の動作に任せる。
// 登録は1回性：すでに登録済みなら先に解除してから登録し直す（二重登録しない）。
const ARROW_DIR = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };

let activeOff = null;

function isTextField(t) {
  if (!t) return false;
  const tag = t.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable === true;
}

export function registerKeys({ add, run, removeLast, isBlocked, getButtons } = {}) {
  if (activeOff) activeOff();
  const disabledOf = (name) => {
    const b = getButtons ? getButtons()?.[name] : null;
    return !!b && b.disabled === true;
  };
  const onKeyDown = (e) => {
    if (e.defaultPrevented || e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (isTextField(t)) return;
    if (isBlocked?.()) return;
    const dir = ARROW_DIR[e.key];
    if (dir) {
      if (disabledOf(dir)) return;
      e.preventDefault();
      add?.(dir);
      return;
    }
    if (e.key === 'Enter') {
      if (e.repeat) {
        // 長押しで本来のクリックが連発しないよう、対象ボタン上では止める。
        if (t?.dataset?.command !== undefined) e.preventDefault();
        return;
      }
      const onPalette = t?.dataset?.command !== undefined;
      const onRun = t?.dataset?.action === 'run';
      const onOtherButton = !onPalette && !onRun && (t?.tagName === 'BUTTON' || t?.getAttribute?.('role') === 'button');
      if (onOtherButton) return;
      if (onPalette || onRun) e.preventDefault();
      if (disabledOf('run')) return;
      if (!onPalette && !onRun) e.preventDefault();
      run?.();
      return;
    }
    if (e.key === 'Backspace') {
      e.preventDefault();
      if (e.repeat) return;
      if (disabledOf('removeLast')) return;
      removeLast?.();
    }
  };
  document.addEventListener('keydown', onKeyDown);
  const off = () => {
    document.removeEventListener('keydown', onKeyDown);
    if (activeOff === off) activeOff = null;
  };
  activeOff = off;
  return off;
}
