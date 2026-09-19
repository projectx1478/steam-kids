// 同期APIの公開エンドポイントURL。真の秘密情報はここに置かない（docs/design-sync.md）。
export const SYNC_ENDPOINT = 'https://steam-kids-sync.projectx1478.workers.dev';

// service-worker.jsのCACHE_NAMEと同値にする（docs/caching.md）。SWからはimportできず
// 二重管理になるため、一致は .claude/verify/scenarios/app-version.mjs で機械チェックする。
export const APP_VERSION = 'steam-kids-cache-v1';
