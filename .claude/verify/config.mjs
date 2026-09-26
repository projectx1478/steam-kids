// .claude/verify/config.mjs（配布対象外・本リポジトリ固有）
// A2（Issue #55）でプレイヤー駒の移動をアニメーション化したため、既存シナリオの
// タイミング前提（0.6秒ピッチ等）を崩さないよう既定でreduced-motionにする。
// アニメーション自体を検証するシナリオ（a2-move-*.mjs）は各シナリオ内で
// page.emulateMedia({ reducedMotion: 'no-preference' }) を呼んで上書きする。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// C2（Issue #81）でcmd-01-susumu・donguri-01-hirouにtutorialステップを追加した際、
// 既存シナリオのレッスン構造（ステップ数・stepId等）の前提を崩さないよう、変更前の
// レッスンJSONをfixtures/へ凍結してこの2レッスンだけ差し替える。新構造を検証する
// シナリオ（c2-tutorial.mjs）は冒頭でpage.unroute()してこの差し替えを外し実JSONを使う。
const FROZEN_LESSONS = ['cmd-01-susumu', 'donguri-01-hirou'];

export default {
  async setupRoutes(page) {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    for (const id of FROZEN_LESSONS) {
      const body = readFileSync(path.join(__dirname, 'fixtures', `${id}.json`));
      await page.route(`**/lessons/${id}.json`, (route) =>
        route.fulfill({ contentType: 'application/json', body })
      );
    }
  },
};
