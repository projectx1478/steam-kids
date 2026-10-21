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

## クレジット表記

子ども画面の設定メニューと保護者側画面に「BGM: MusMus」と文字で表記します
（外部リンクは置かない。Issue #378・悠 2026-10-21 決定。実装は段2）。

## 効果音

効果音（`js/sfx.js`）は Web Audio で合成した自前のものです。今後新しく必要になった
場合は、外部の無料素材も候補として検証しうる（採用条件は PROJECT.md 参照）。
