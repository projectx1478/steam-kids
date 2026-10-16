# ドキュメント字数上限と分割手順

AGENTS.mdの索引から参照される。AGENTS.md／CLAUDE.md／PROJECT.md／SESSION.mdなど運用文書を編集・肥大化対応するときに読む。上限判定は`scripts/check-file-size.sh`のcount_chars（UTF-8文字数）に従う。

## 目安上限

- AGENTS.md 8,000字／CLAUDE.md 4,000字／PROJECT.md 12,000字／SESSION.md 6,000字。超過は内容を削るシグナル（1項目1行、120字超は削るか理由・経緯をPR/Issueへ移す）
- ファイルサイズ規則はコード＝行数／ドキュメント＝字数で分ける。コードは目安1000行超で機能単位に分割

## SESSION.mdの削り方

SESSION.mdが上限を超えたら、①クローズ済みIssueに関するメモ、②古くなった知見、の順で削る。恒久的な制約は削らない。

## PROJECT.mdの書き方

PROJECT.mdは決定事項のみ記載し、検討経緯・却下案・変更理由はPR/Issueに残す（追記でなく置き換えが基本）。

## 超過時の分割

超過時は機能単位でdocs/へ分割し、索引（各ファイル1行＋読むタイミング）を必ず追記する。
