#!/usr/bin/env bash
# check-file-size.sh: 処理本体は全ツール共通のscripts/check-file-size.shへ移設（Issue #90）。
# このファイルはClaude Codeのhooks設定（.claude/settings.json）からの1行ラッパー。
set -euo pipefail
exec "${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}/scripts/check-file-size.sh"
