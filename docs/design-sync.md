# 同期・バックエンド・機密情報管理

P3着手時に読む。バックエンドは決定済み（下記）。

## 同期方式

- **localStorage を正とする**。オフラインで学習を継続できること
- オンライン復帰時に未送信イベントをまとめて送信する（push、差分のみ）
- 受信（pull）は**常に全件取得**する（`since=0`固定）。差分取得はしない。理由は下記「pullが
  差分取得をしない理由」を参照
- 受信側は `eventId` で重複排除し、`ts` 昇順にマージする
- イベントは追記のみ。上書き・削除をしない

### pullが差分取得をしない理由（Issue #35）

リンクコード乗り換え（下記）で他端末の過去イベントがこの `learnerId` へ事後的に付け替わる場合、
そのイベント自身の `ts` は過去のままである。`ts`を基準にした差分取得（`since=<前回pull時の最大ts>`）
だと、乗り換えの当事者ではない端末はこの付け替えを恒久的に検知できず取りこぼす。
本アプリの利用規模（1学習者あたり数十〜数百件/年オーダー）では全件取得の通信量は無視できるため、
差分取得は行わない。

**既知の制約**: サーバーの`GET /sync`は最大1000件・`ts`昇順で返す（下記API参照）。総イベント数が
1000件を超える学習者は常に最古1000件のみが返り、新しいイベントを取りこぼす。現状の利用規模では
非現実的だが、解消していない（別Issue化を検討）。

## 複数端末の紐付け（リンクコード方式）

- 既存端末で6文字コードを発行する（有効期限24時間、1回限り）
- 新端末でコードを入力すると同じ `learnerId` を共有する
- コードは英数字。紛らわしい文字（0/O、1/I/l）を除外する

### 乗り換え（既に自分の `learnerId` で同期済みの端末がコードを入力した場合）

有効なコードの提示を本人確認とみなし、この端末を発行元の `learnerId` へ**付け替える**
（学習履歴は統合する。Issue #33）。

- `devices` 行の `learnerId` を発行元のものへ更新する
- 乗り換え前の `learnerId` に**他の端末が残っていない**場合のみ、そのイベントを発行元の
  `learnerId` へ移管する（他端末が残る場合は、その端末の履歴を失わせないため移管しない）
- クライアントは乗り換え成功時に `lastPushedTs` を0へリセットし、自分の全ローカル履歴を
  再送信する（pullは元々常に全件取得のため、乗り換え固有のリセットは不要。上記参照）

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

CREATE TABLE guardians (learnerId TEXT PRIMARY KEY, passHash TEXT NOT NULL, updatedAt INTEGER NOT NULL);
```

`events` は学習イベント7フィールドと1対1。氏名・学校名・学年、`label` の列は作らない。
`guardians.passHash` は保護者ゲートの合言葉のSHA-256ハッシュ（生の合言葉は保存しない）。

### API

| メソッド | パス | 認証 | 内容 |
| --- | --- | --- | --- |
| POST | `/register` | 無 | `{ learnerId, syncSecret }`。既存`learnerId`はハッシュ一致時のみ200、不一致は403 |
| POST | `/sync` | 有 | `{ events[] }` を`INSERT OR IGNORE`。`{ acceptedCount }`を返す。500件/512KB超は413 |
| GET | `/sync?since=<ts>` | 有 | `ts >= since`のイベントを`ts`昇順、最大1000件。クライアントは常に`since=0`で呼ぶ（上記「pullが差分取得をしない理由」参照） |
| POST | `/link/issue` | 有 + `X-Guardian-Token` | `{ code, expiresAt }`。6文字・24h・1回限り。トークン無し/期限切れは401 |
| POST | `/link/redeem` | 無 | `{ code, syncSecret }` → `{ learnerId }`。期限切れ・使用済みは410。既に別の`learnerId`へ同期済みの端末は発行元へ付け替える（上記「乗り換え」参照） |
| POST | `/guardian/set` | 有 | `{ passcode }` → `{ set }`。未設定時のみ`passHash`（SHA-256）を保存。設定済みなら`set: false`で何もしない |
| POST | `/guardian/auth` | 有 | `{ passcode }` → `{ token, exp }`。HMAC-SHA256・TTL6時間、署名鍵に`passHash`を流用（合言葉変更で既存トークンが自動失効）。誤パスコードは401 |
| POST | `/guardian/change` | 有 | `{ current, next }` → `{ changed }`。`current`不一致は401、`next`が4文字未満は400 |

- リンクコードの文字集合：英大文字+数字から `0` `O` `1` `I` を除いた32文字（`ABCDEFGHJKLMNPQRSTUVWXYZ23456789`）
- `/register`・`/link/redeem`・`/guardian/auth` は同一IP 10回/10分を超えたら429
- CORSは `https://projectx1478.github.io` のみ許可（許可ヘッダに`X-Guardian-Token`を含む）

## 保護者ゲート（ダッシュボード保護）

Issue #37・#38対応（いずれも実装済み）。`dashboard.html` は子ども画面の歯車リンクから無認証で
入れ、呼び名編集・同期操作・リンクコード発行/入力まで子どもが実行できてしまう不備があった。
kids-player の管理画面保護（Issue #66）に準拠する。

### 二層構成

- **ローカル層（オフライン可）**: 閲覧解錠は端末内のPBKDF2-SHA256照合のみで行う。
  `steamkids.guardian` に salt・ハッシュのみを保存し、生の合言葉は保存しない。解錠状態は
  モジュールスコープの変数のみで保持し、ダッシュボードを開き直すたびに再度ロックされる
- **サーバー層（Issue #38）**: 同期系の特権操作（リンクコード発行）はWorker発行のHMAC短命
  トークン（`X-Guardian-Token`・TTL6時間）を必須にする。ローカル解錠に成功した合言葉を
  オンライン時のみ`/guardian/auth`へ送りトークンを取得する（送信は平文だがHTTPS経由、サーバーは
  SHA-256ハッシュのみ保存）。トークンはモジュールスコープのみで保持し、取得に失敗しても
  ローカル層の解錠自体は妨げない（フォールバックなしでサーバー側が401を返すだけ）

### 保護対象の切り分け

| 操作 | 保護 |
| --- | --- |
| ダッシュボード閲覧・呼び名編集・同期停止 | ローカルゲート通過必須 |
| 同期を始める `/register` | ローカルゲート通過必須（クライアント側のみ） |
| リンクコード発行 `/link/issue` | ローカルゲート通過 + オフライン時はボタンを無効化 + サーバー側`X-Guardian-Token`必須（#38） |
| コード入力 `/link/redeem` | ローカルゲート通過必須 |
| `POST /sync` `GET /sync` | 端末シークレットのまま（変更なし。残留リスク参照） |

### 残留リスク

- ローカル層は devtools・localStorage 編集で迂回可能。年長児には十分だが、校内配布では
  #38 のサーバー側トークンが`/link/issue`の保護の実体になる
- `POST /sync`・`GET /sync`は端末シークレットのみのまま（`X-Guardian-Token`を要求しない）。
  端末に触れれば学習イベントの閲覧・追記は可能。リンクコード発行のみを#38で保護している
- 合言葉を忘れた場合の復旧手段は無い（リセットボタンは迂回口になるため作らない）。
  サイトデータを削除すれば再設定できるが学習履歴も消える

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
