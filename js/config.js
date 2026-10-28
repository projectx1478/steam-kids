// 同期APIの公開エンドポイントURL。真の秘密情報はここに置かない（docs/design-sync.md）。
export const SYNC_ENDPOINT = 'https://steam-kids-sync.projectx1478.workers.dev';

// service-worker.jsのCACHE_NAMEと同値にする（docs/caching.md）。SWからはimportできず
// 二重管理になるため、一致は .claude/verify/scenarios/app-version.mjs で機械チェックする。
export const APP_VERSION = 'steam-kids-cache-v99';

// BGM（Issue #378 段2）。音源は ogg のみ。ファイルは公開リポジトリに置かず、Pages デプロイ時に
// 非公開リポジトリ steam-kids-state から audio/ へ配置する（取得できない環境では曲なしで動作）。
// 音量の初期値は控えめ（微調整は段3。操作画面は効果音より必ず小さい・クリア曲はファンファーレより小さい）。
export const BGM_FADE_MS = 500;
export const BGM_TRACKS = {
  title: { url: 'audio/title.ogg', volume: 0.28 },
  map: { url: 'audio/lesson_logic.ogg', volume: 0.22 },
  play: { url: 'audio/play_logic.ogg', volume: 0.15 },
  clear: { url: 'audio/clear_logic.ogg', volume: 0.12 },
};

// 画面→BGM場面の対応表（Issue #541）。setScene の直書きをここへ集約する。
// タイトル〜大項目＝title／単元マップ・導入・チュートリアル＝map／操作＝play／クリア演出・まとめ＝clear。
export const BGM_SCENE_BY_SCREEN = {
  title: 'title',
  slotSelect: 'title',
  story: 'title',
  trackSelect: 'title',
  unitMap: 'map',
  intro: 'map',
  tutorial: 'map',
  predict: 'play',
  play: 'play',
  seedPick: 'play',
  trial: 'play',
  clear: 'clear',
  summary: 'clear',
};
export function sceneFor(screen) {
  return BGM_SCENE_BY_SCREEN[screen];
}

// クリック音（js/sfx.js initClickSfx）を鳴らさないボタン（Issue #550）。専用音・大演出音を別に持つものだけ。
export const CLICK_SFX_EXEMPT = [
  { selector: '[data-action="retry"]', reason: 'ためしなおす：黒幕の遷移のあと start 合図音（ui-retry showStartCue）が鳴る' },
];
