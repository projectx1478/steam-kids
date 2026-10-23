// 同期APIの公開エンドポイントURL。真の秘密情報はここに置かない（docs/design-sync.md）。
export const SYNC_ENDPOINT = 'https://steam-kids-sync.projectx1478.workers.dev';

// service-worker.jsのCACHE_NAMEと同値にする（docs/caching.md）。SWからはimportできず
// 二重管理になるため、一致は .claude/verify/scenarios/app-version.mjs で機械チェックする。
export const APP_VERSION = 'steam-kids-cache-v84';

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
