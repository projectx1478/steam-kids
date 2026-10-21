# 音声素材の出典・ライセンス（#378）

## BGM

MusMus（https://musmus.main.jp）の楽曲を使用しています。各曲のファイルは
**本リポジトリには置かず**、非公開リポジトリ `steam-kids-state` の `bgm/` に保管し、
GitHub Pages デプロイ時（`.github/workflows/pages.yml`）に読み取り deploy key で
取得して配信物の `audio/` へ同名コピーします。配信時に取得できない環境では
曲なしで動作します。

| 場面 | ファイル | 楽曲 | 出典 |
| --- | --- | --- | --- |
| タイトル | `audio/title.ogg` | BGM-047 | MusMus |
| 単元マップ | `audio/lesson_logic.ogg` | BGM-107 | MusMus |
| 操作画面 | `audio/play_logic.ogg` | BGM-029 | MusMus |
| クリア | `audio/clear_logic.ogg` | JGL-027 | MusMus |

- 形式は ogg のみ（フォールバック無し）
- 4曲合計 1.5MB 以内（超過時は音源の再エンコードを AI が行わず、人が判断する）

再生は `js/bgm.js`（最初のタップで開始・約0.5秒フェードで場面切替・タブ非表示で停止・
ミュートは `steamkids.sound` と連動）。Service Worker 未対応環境では曲なしで動作する
（初回再生の404を避けるため、SW登録がある環境でのみ音源を読む。曲自体の読み込み失敗は
無音のままエラーにしない）。音源のキャッシュは `service-worker.js` が初回再生時に遅延保存する
（`docs/caching.md` 参照）。

## クレジット表記

子ども画面の設定メニュー（⚙の中央パネルに「クレジット」項目。押すと「BGM: MusMus」を
文字で表示）と保護者側画面（`dashboard.html` のフッタ）に表記します
（外部リンクは置かない。Issue #378・悠 2026-10-21 決定。Issue #378 段2で実装）。

## 効果音

効果音（`js/sfx.js`）は Web Audio で合成した自前のものです。今後新しく必要になった
場合は、外部の無料素材も候補として検証しうる（採用条件は PROJECT.md 参照）。
