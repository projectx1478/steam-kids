// 「ぜんぶけす」の取り消し（Issue #549）の純関数。DOMには触らない（札・タイマーは ui-play.js）。
// 命令列 S.drafts[stepId] との共有参照を保つため、復元は同じ配列へ splice で戻す（差し替えない）。

// 取り消せる秒数（ミリ秒）。
export const UNDO_CLEAR_MS = 5000;

const cloneCommand = (c) => (c && Array.isArray(c.box) ? { ...c, box: c.box.map((x) => ({ ...x })) } : { ...c });

// snapshotUnlocked(commands, lockedCount): 後ろ(lockedCount以降)の複製。止まった間の前の部分は消えないので含めない。
export function snapshotUnlocked(commands, lockedCount) {
  return commands.slice(lockedCount).map(cloneCommand);
}

// restoreUnlocked(commands, snapshot, lockedCount): 同じ配列へ後ろを戻す。戻した数を返す。
// 消した後に何か足されていたら（長さが lockedCount を超える）戻さず 0 を返す。
export function restoreUnlocked(commands, snapshot, lockedCount) {
  if (!snapshot || snapshot.length === 0 || commands.length !== lockedCount) return 0;
  commands.splice(lockedCount, 0, ...snapshot.map(cloneCommand));
  return snapshot.length;
}

// undoRemaining(elapsedMs, totalMs): 減り棒の残り割合（1→0）。
export function undoRemaining(elapsedMs, totalMs = UNDO_CLEAR_MS) {
  if (!(totalMs > 0)) return 0;
  return Math.min(1, Math.max(0, 1 - elapsedMs / totalMs));
}
