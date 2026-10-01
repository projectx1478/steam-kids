// guard.mjs: E2E手元実行ガード（config.mjsの ciOnly: true | { hint } でオプトイン）
// run.mjs・run-all.mjsから呼ばれる。ciOnly未指定なら何もしない（従来どおり手元で実行できる）。
// CIか E2E_LOCAL=1 のときは実行を許可し、それ以外は案内を表示して終了コード2で止める。

export function guardCiOnly(config) {
  const ciOnly = config.ciOnly;
  if (!ciOnly) return;
  if (process.env.CI || process.env.E2E_LOCAL === '1') return;
  console.error('E2Eは手元で実行しない。GitHub Actionsで実行する（docs/testing-guidelines.md）。');
  if (typeof ciOnly === 'object' && ciOnly.hint) console.error(ciOnly.hint);
  console.error('明示的に手元実行を指示された場合のみ E2E_LOCAL=1 を付ける');
  process.exit(2);
}
