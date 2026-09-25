// .claude/verify/config.mjs（配布対象外・本リポジトリ固有）
// A2（Issue #55）でプレイヤー駒の移動をアニメーション化したため、既存シナリオの
// タイミング前提（0.6秒ピッチ等）を崩さないよう既定でreduced-motionにする。
// アニメーション自体を検証するシナリオ（a2-move-*.mjs）は各シナリオ内で
// page.emulateMedia({ reducedMotion: 'no-preference' }) を呼んで上書きする。
export default {
  async setupRoutes(page) {
    await page.emulateMedia({ reducedMotion: 'reduce' });
  },
};
