#!/usr/bin/env bash
# rebuild-branch.sh: 指定ブランチをmain最新から再構築する
#
# CLAUDE.mdのGitHub運用ルール「直近PRがマージ済みの場合、pushする前に
# 対象ブランチをmain最新から再構築する」のgit操作部分をまとめたもの。
# PRがマージ済みかどうかの判定はスクリプト側では行わない（GitHub API確認は
# 呼び出し側でMCPツール等を使って行うこと）。
#
# 使い方: rebuild-branch.sh <branch-name>
set -euo pipefail

BRANCH="${1:?usage: rebuild-branch.sh <branch-name>}"

git fetch origin main
git checkout -B "$BRANCH" origin/main
git push origin "$BRANCH"

SHA=$(git rev-parse --short origin/main)
echo "REBUILT: '$BRANCH' reset to origin/main ($SHA) and pushed"
