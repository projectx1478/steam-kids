#!/usr/bin/env bash
# new-repo-setup.sh: 新規リポジトリをbroadcast配布対象へ追加し、PROJECT.md雛形を配置する
#
# 行うこと:
#   1. .github/sync-targets.json に <owner/repo> を追加（重複時は何もしない）
#      → mainマージ後、sync-template-broadcast.yml が起動し
#        CLAUDE.md / AGENTS.md / opencode.json / .claude/verify/ が自動配布される
#   2. <target-dir>/PROJECT.md が存在しなければ、本リポジトリのPROJECT.md
#      （プレースホルダー入りの雛形）をそのままコピーする
#      （既に存在する場合は上書きしない）
#
# 行わないこと（別途手動で行う）:
#   - 新規リポジトリ自体の作成（GitHub Web UIで行う。create_repositoryはツール
#     承認エラーで失敗するため）
#   - sync-targets.json変更のcommit/push/PR作成（本スクリプトはファイル変更のみ。
#     CLAUDE.mdのGitHub運用ルールに従いブランチ作成→コミット→PR作成すること。
#     SESSION.md単独ではないため直接push不可）
#   - コピーしたPROJECT.mdの内容確定（プレースホルダーの置き換え）
#
# 使い方:
#   .claude/scripts/new-repo-setup.sh <owner/repo> [target-dir]
#   target-dir省略時はPROJECT.mdのコピーを行わずsync-targets.json追加のみ行う
set -euo pipefail

TARGET="${1:?usage: new-repo-setup.sh <owner/repo> [target-dir]}"
TARGET_DIR="${2:-}"

if [[ ! "$TARGET" =~ ^[^/]+/[^/]+$ ]]; then
  echo "エラー: <owner/repo> 形式で指定してください（例: projectx1478/new-app）" >&2
  exit 1
fi

SRC_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SYNC_TARGETS="$SRC_ROOT/.github/sync-targets.json"

if jq -e --arg t "$TARGET" 'index($t) != null' "$SYNC_TARGETS" > /dev/null; then
  echo "SKIP: '$TARGET' は既に sync-targets.json に登録済み"
else
  jq --arg t "$TARGET" '. + [$t]' "$SYNC_TARGETS" > "$SYNC_TARGETS.tmp"
  mv "$SYNC_TARGETS.tmp" "$SYNC_TARGETS"
  echo "ADDED: '$TARGET' を sync-targets.json に追加"
fi

if [ -z "$TARGET_DIR" ]; then
  echo "target-dir未指定のためPROJECT.mdのコピーは行わない"
  exit 0
fi

if [ ! -d "$TARGET_DIR" ]; then
  echo "エラー: target-dir '$TARGET_DIR' が存在しない" >&2
  exit 1
fi

DEST_PROJECT_MD="$TARGET_DIR/PROJECT.md"
if [ -e "$DEST_PROJECT_MD" ]; then
  echo "SKIP: '$DEST_PROJECT_MD' は既に存在するため上書きしない"
else
  cp "$SRC_ROOT/PROJECT.md" "$DEST_PROJECT_MD"
  echo "COPIED: PROJECT.md雛形を '$DEST_PROJECT_MD' に配置（プレースホルダーの置き換えが必要）"
fi
