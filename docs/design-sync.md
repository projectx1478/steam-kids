# 同期・バックエンド・機密情報管理

P3着手時に読む。バックエンドは決定済み（下記）。

## 同期方式

- **localStorage を正とする**。オフラインで学習を継続できること
- オンライン復帰時に未送信イベントをまとめて送信する
- 受信側は `eventId` で重複排除し、`ts` 昇順にマージする
- イベントは追記のみ。上書き・削除をしない

## 複数端末の紐付け（リンクコード方式）

- 既存端末で6文字コードを発行する（有効期限24時間、1回限り）
- 新端末でコードを入力すると同じ `learnerId` を共有する
- コードは英数字。紛らわしい文字（0/O、1/I/l）を除外する

## バックエンド（決定事項）

**Cloudflare Workers + D1**。検討経緯・却下案は Issue #3 のコメントに記録済み。

- Worker名: `steam-kids-sync`（コードは本リポジトリ `workers/steam-kids-sync/`）
- D1データベース名: `steam-kids-sync`（database_id: `6efb84b6-8aff-42cf-b4c5-07c8a1a978b7`）
- エンドポイントURL: `https://steam-kids-sync.projectx1478.workers.dev`
  （デプロイ済み・Issue #20の完了条件9項目をcurlで確認済み）。P3-2で `js/config.js` の
  `SYNC_ENDPOINT` に設定する

### 匿名認証（端末シークレット方式）

アカウント・メール・パスワードを作らない。

- 端末初回に `syncSecret`（32バイト乱数、base64url）をクライアントで生成し端末内にのみ保存する。
  サーバーは **SHA-256ハッシュのみ**を `devices.secretHash` に保存し、生の値は保持しない
- `learnerId` は既存の `steamkids.profile` のものを使う
- リクエストは `Authorization: Bearer <learnerId>.<syncSecret>` を送る。サーバーは
  `syncSecret` のハッシュから `devices` を引いて `learnerId` を解決し、
  **リクエストbody中の `learnerId` は信用しない**
- 1つの `learnerId` に複数端末の `secretHash` を許す。これが複数端末紐付けの実体で、
  新規追加は `/link/redeem` 経由のみ許可する（`/register` で他人の `learnerId` に
  無断で相乗りできないようにするため）

### D1 スキーマ

```sql
CREATE TABLE devices (secretHash TEXT PRIMARY KEY, learnerId TEXT NOT NULL, createdAt INTEGER NOT NULL);
CREATE INDEX idx_devices_learner ON devices(learnerId);

CREATE TABLE events (
  eventId TEXT PRIMARY KEY, learnerId TEXT NOT NULL, lessonId TEXT,
  stepId TEXT, type TEXT NOT NULL, ts INTEGER NOT NULL, payload TEXT
);
CREATE INDEX idx_events_learner_ts ON events(learnerId, ts);

CREATE TABLE link_codes (code TEXT PRIMARY KEY, learnerId TEXT NOT NULL, expiresAt INTEGER NOT NULL, usedAt INTEGER);
CREATE TABLE rate_limits (key TEXT PRIMARY KEY, windowStart INTEGER NOT NULL, count INTEGER NOT NULL);
```

`events` は学習イベント7フィールドと1対1。氏名・学校名・学年、`label` の列は作らない。

### API

| メソッド | パス | 認証 | 内容 |
| --- | --- | --- | --- |
| POST | `/register` | 無 | `{ learnerId, syncSecret }`。既存`learnerId`はハッシュ一致時のみ200、不一致は403 |
| POST | `/sync` | 有 | `{ events[] }` を`INSERT OR IGNORE`。`{ acceptedCount }`を返す。500件/512KB超は413 |
| GET | `/sync?since=<ts>` | 有 | `ts >= since`のイベントを`ts`昇順、最大1000件 |
| POST | `/link/issue` | 有 | `{ code, expiresAt }`。6文字・24h・1回限り |
| POST | `/link/redeem` | 無 | `{ code, syncSecret }` → `{ learnerId }`。期限切れ・使用済みは410 |

- リンクコードの文字集合：英大文字+数字から `0` `O` `1` `I` を除いた32文字（`ABCDEFGHJKLMNPQRSTUVWXYZ23456789`）
- `/register` と `/link/redeem` は同一IP 10回/10分を超えたら429
- CORSは `https://projectx1478.github.io` のみ許可

## 機密情報管理（決定事項）

- Workerは秘密情報を持たない（D1バインディングのみ。APIキー・トークンをWorkerに置かない）
- `syncSecret`（真の秘密情報）はクライアントが生成し**端末内にのみ**置く。Gitにコミットしない。
  サーバーはSHA-256ハッシュのみを保存し、生の値を保持・ログ出力しない
- クライアントコード（Gitにコミットされるファイル）に直書きしてよいのは
  **公開エンドポイントURLのみ**。値は `js/config.js` の `SYNC_ENDPOINT` 1箇所に集約する
- 新たに「真の秘密情報」に該当する値を追加する場合は、直書きせず必ずユーザーに設計を確認する

## 同期してはいけないもの

PROJECT.md「プライバシー要件」を参照。氏名・学校名・学年、および呼び名（`label`）は
同期データに含めない。
