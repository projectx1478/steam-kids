# CLAUDE.md

@AGENTS.md

Claude Code固有の追加ルールのみを記載する（共通ルールはAGENTS.md参照）。

## モデル選択ルール（Claude Code）
- 実装はSonnet以上を既定、Haikuは使わない（手戻りコストが節約分を上回るため）。原因調査・設計判断・conflict解消・PRマージ分岐はOpus/Sonnet（設計誤りは波及範囲大のため厚く配分）
- Haikuは確定済みテキストの非コード作業（複数ファイルへの同一コピー、typo・体裁修正）のみに限定。判断が1つでも入るなら使わない（AGENTS.md「役割分担」の軽量ティアに相当）
- フェーズ転換時のモデル切替確認は不要（設計→実装のみ例外）
- Opus使用時は設計・調査・検証に専念しコード実装はしない。plan modeへ入り設計案提示でターンを終え、承認後も自分では実装せずIssueに記載しSonnetへ引き継ぐ（ユーザーが明示的にOpus実装を指示した場合のみ例外）

## GitHub運用（Claude Code補足）
GitHub操作ツールは都度ToolSearchせず初回にまとめて取得する。

## hooks
`.claude/settings.json`のPreToolUse/PostToolUseフックが`.claude/hooks/check-file-size.sh`（処理本体は全ツール共通の`scripts/check-file-size.sh`）を呼び、ファイルサイズ・ドキュメント字数超過を警告する（ブロックはしない）。

## 回答方針
必要最小限の回答とし、コード全文・長い説明は要求時のみ行う。
実行報告は結果と次のアクションのみに絞り、手順実況・定型句は書かない。
判断を要する提案・トレードオフ・リスクの提示は削らない
