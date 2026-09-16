#!/usr/bin/env bash
# broadcast-sync.sh: project-templateの同期対象ファイルを配布先リポジトリへ反映する
#
# 配布対象は .github/sync-files.txt、配布先は .github/sync-targets.json で管理する。
# 配布先では同期対象ファイルを編集しない（編集はproject-template側で行う）。
#
# 使い方:
#   GH_TOKEN=xxx bash .claude/scripts/broadcast-sync.sh <owner/repo>
#   DRY_RUN=1 GH_TOKEN=xxx bash .claude/scripts/broadcast-sync.sh <owner/repo>
#     → clone〜差分表示までを行い、push/PR作成は行わない
set -euo pipefail

TARGET="${1:?usage: broadcast-sync.sh <owner/repo>}"
GH_TOKEN="${GH_TOKEN:?GH_TOKEN is required}"
DRY_RUN="${DRY_RUN:-0}"

SRC_ROOT="$(pwd)"
SYNC_LIST="$SRC_ROOT/.github/sync-files.txt"

WORKDIR=$(mktemp -d)
trap 'rm -rf "$WORKDIR"' EXIT

git clone --depth 1 "https://x-access-token:${GH_TOKEN}@github.com/${TARGET}.git" "$WORKDIR"

while IFS= read -r entry || [ -n "$entry" ]; do
  [ -z "$entry" ] && continue
  case "$entry" in \#*) continue ;; esac
  SRC_PATH="$SRC_ROOT/$entry"
  DST_PATH="$WORKDIR/$entry"
  mkdir -p "$(dirname "$DST_PATH")"
  if [ -d "$SRC_PATH" ]; then
    rm -rf "$DST_PATH"
    cp -r "$SRC_PATH" "$DST_PATH"
  else
    cp "$SRC_PATH" "$DST_PATH"
  fi
done < "$SYNC_LIST"

cd "$WORKDIR"

if ! grep -qxF '.verify/' .gitignore 2>/dev/null; then
  printf '\n.verify/\n' >> .gitignore
fi

git add -A
if git diff --cached --quiet; then
  echo "No changes for $TARGET, skipping"
  exit 0
fi

if [ "$DRY_RUN" = "1" ]; then
  echo "DRY_RUN: changes detected for $TARGET"
  git diff --cached --stat
  exit 0
fi

BRANCH="sync/template-from-project-template"
git config user.name "claude-template-sync-bot"
git config user.email "actions@users.noreply.github.com"
git checkout -B "$BRANCH"
git commit -m "テンプレート同期: project-templateとの同期"
git push -f origin "$BRANCH"

EXISTING=$(gh pr list --repo "$TARGET" --head "$BRANCH" --state open --json number --jq '.[0].number // empty')
if [ -z "$EXISTING" ]; then
  gh pr create --repo "$TARGET" --head "$BRANCH" --base main \
    --title "テンプレート同期: project-templateとの同期" \
    --body "project-templateの同期対象ファイル更新を反映する自動PRです。内容はproject-templateと完全一致するため、自動的にマージされます。"
  PR_NUMBER=$(gh pr list --repo "$TARGET" --head "$BRANCH" --state open --json number --jq '.[0].number')
else
  echo "PR #$EXISTING already open for $TARGET, branch updated"
  PR_NUMBER="$EXISTING"
fi
gh pr merge "$PR_NUMBER" --repo "$TARGET" --merge --delete-branch
