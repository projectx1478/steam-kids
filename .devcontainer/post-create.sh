#!/usr/bin/env bash
# post-create.sh: Codespace作成時に共通のツール層を導入する
#
# ここではプロジェクト共通のツール（OpenCode CLI・検証ハーネス用のPlaywright/
# Chromium）のみを導入する。プロジェクト固有の依存（npm install等）は
# .devcontainer/setup-project.sh（配布対象外、各リポジトリが所有）に書くこと。
set -euo pipefail

echo "==> .nvmrcのNodeバージョンを適用"
# グローバル導入（opencode-ai/playwright）より前に切り替える。nvmはNodeバージョンごとに
# グローバルディレクトリを分けるため、後から切り替えると導入済みコマンドがPATHから消える。
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NVMRC="$REPO_ROOT/.nvmrc"
if [ ! -f "$NVMRC" ]; then
  echo "  .nvmrcが無いためスキップ（現在: $(node -v)）"
else
  WANT="$(tr -d '[:space:]v' < "$NVMRC")"
  CURRENT="$(node -v | tr -d 'v')"
  if [ "${CURRENT%%.*}" = "${WANT%%.*}" ]; then
    echo "  Node ${CURRENT}は.nvmrc(${WANT})と一致するためスキップ"
  else
    export NVM_DIR="${NVM_DIR:-/usr/local/share/nvm}"
    [ -s "$NVM_DIR/nvm.sh" ] || export NVM_DIR="$HOME/.nvm"
    if [ ! -s "$NVM_DIR/nvm.sh" ]; then
      echo "  nvmが見つからないためインストール"
      curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
    fi
    # nvm.shはset -u下で未定義変数を参照し即死するため、読み込み中のみ解除する
    set +eu
    . "$NVM_DIR/nvm.sh"
    nvm install "$WANT"
    nvm alias default "$WANT"
    nvm use "$WANT"
    set -eu
    echo "  Node $(node -v)へ切替"
  fi
fi

echo "==> OpenCode CLIをインストール"
npm install -g opencode-ai

echo "==> opencode web起動コマンドを簡略化"
# Codespacesのポート転送は127.0.0.1バインドに到達できないため、
# opencode web には --hostname 0.0.0.0 --port 4096 が必須（詳細はREADME.md参照）。
# 毎回覚えて打たなくて済むよう、`opencode web`単体でこの既定値が付くようにする。
cat <<'EOF' >> ~/.bashrc

opencode() {
  if [ "$1" = "web" ]; then
    shift
    command opencode web --hostname 0.0.0.0 --port 4096 "$@"
  else
    command opencode "$@"
  fi
}
EOF

echo "==> Playwright + Chromiumをグローバル導入"
# .claude/verify/run.mjs の resolvePlaywright() が require('playwright') 失敗時に
# `npm root -g` へフォールバックするため、グローバル導入が必須（プロジェクト直下ではない）
npm install -g playwright
npx --yes playwright install --with-deps chromium

echo "==> Git hooks (.githooks) を有効化"
# main直接commit防止・main直接push/force push防止（AGENTS.md「GitHub運用」の機構的補強）。
# core.hooksPathが未設定の配布先にのみ設定する。husky等で既に設定済みの配布先を
# 上書きすると、その配布先のフックが無効になるため踏み込まない。
EXISTING_HOOKS_PATH="$(git config --get core.hooksPath || true)"
if [ -z "$EXISTING_HOOKS_PATH" ]; then
  git config core.hooksPath .githooks
elif [ "$EXISTING_HOOKS_PATH" != ".githooks" ]; then
  echo "警告: core.hooksPathが既に${EXISTING_HOOKS_PATH}に設定されているためスキップ（上書きしません）"
  echo "  .githooks/pre-push・pre-commitの内容を${EXISTING_HOOKS_PATH}側へ手動で組み込んでください"
fi

if [ -f "$(dirname "${BASH_SOURCE[0]}")/setup-project.sh" ]; then
  echo "==> setup-project.shを実行"
  bash "$(dirname "${BASH_SOURCE[0]}")/setup-project.sh"
fi

echo "==> post-create.sh完了"
