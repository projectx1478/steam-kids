// 表示設定（もじを おおきく／うごきを へらす。Issue #379）。設定は profile（localStorage のみ・同期しない）に持ち、
// 子ども画面では <html> の data 属性で効かせる。動きを減らす判定はここ1か所（端末の設定 OR アプリの設定）。

// profile → <html> の data 属性の値
export function displayAttrs(profile) {
  return {
    text: profile?.largeText === true ? 'large' : null,
    motion: profile?.reduceMotion === true ? 'reduce' : null,
  };
}

export function applyDisplayPrefs(profile, root = globalThis.document?.documentElement) {
  if (!root?.dataset) return;
  const { text, motion } = displayAttrs(profile);
  if (text === null) delete root.dataset.skText;
  else root.dataset.skText = text;
  if (motion === null) delete root.dataset.skMotion;
  else root.dataset.skMotion = motion;
}

export function prefersReducedMotion() {
  return globalThis.document?.documentElement?.dataset?.skMotion === 'reduce'
    || (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
}
