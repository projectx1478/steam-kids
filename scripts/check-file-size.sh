#!/usr/bin/env bash
# check-file-size.sh: ファイルサイズに関する警告（2機能を同居させる）。全ツール共通の呼び出し先。
# Claude Codeからは.claude/hooks/check-file-size.sh（1行ラッパー）経由で呼ばれる。
# - PreToolUse(Read): offset/limit指定なしで1000行超または30000字超のファイルを読もうとした場合に、
#   AGENTS.md「トークン方針」（必要な範囲のみ読む）を思い出させる警告を返す。
# - PostToolUse(Edit|Write): AGENTS.md/CLAUDE.md/PROJECT.md/SESSION.mdがドキュメント字数上限を超えた場合に警告する。
# いずれも警告のみで操作はブロックしない。
set -euo pipefail

THRESHOLD_LINES=1000
THRESHOLD_CHARS=30000

# ドキュメント別字数上限（AGENTS.md「トークン方針」参照）
DOC_LIMIT_AGENTS=8000
DOC_LIMIT_CLAUDE=4000
DOC_LIMIT_PROJECT=12000
DOC_LIMIT_SESSION=6000

INPUT=$(cat)
HOOK_EVENT=$(printf '%s' "$INPUT" | jq -r '.hook_event_name // empty')
FILE_PATH=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // empty')

emit_warning() {
  local hook_event="$1" reason="$2"
  jq -n --arg reason "$reason" --arg event "$hook_event" '{
    hookSpecificOutput: {
      hookEventName: $event,
      permissionDecision: "allow",
      permissionDecisionReason: $reason,
      additionalContext: $reason
    }
  }'
}

check_read_size() {
  local offset limit
  offset=$(printf '%s' "$INPUT" | jq -r '.tool_input.offset // empty')
  limit=$(printf '%s' "$INPUT" | jq -r '.tool_input.limit // empty')

  if [ -z "$FILE_PATH" ] || [ -n "$offset" ] || [ -n "$limit" ] || [ ! -f "$FILE_PATH" ]; then
    return 0
  fi

  local line_count char_count exceeded
  line_count=$(wc -l < "$FILE_PATH" 2>/dev/null || echo 0)
  char_count=$(wc -m < "$FILE_PATH" 2>/dev/null || echo 0)

  exceeded=""
  if [ "$line_count" -gt "$THRESHOLD_LINES" ]; then
    exceeded="${line_count}行"
  fi
  if [ "$char_count" -gt "$THRESHOLD_CHARS" ]; then
    if [ -n "$exceeded" ]; then
      exceeded="${exceeded}・${char_count}字"
    else
      exceeded="${char_count}字"
    fi
  fi

  if [ -n "$exceeded" ]; then
    emit_warning "PreToolUse" "ファイル ${FILE_PATH} は ${exceeded} あり、offset/limit指定なしで全文読み込もうとしています。AGENTS.mdのトークン方針に従い、必要な範囲のみ読むことを検討してください。"
  fi
}

check_doc_limit() {
  if [ -z "$FILE_PATH" ] || [ ! -f "$FILE_PATH" ]; then
    return 0
  fi

  local base limit
  base=$(basename "$FILE_PATH")
  case "$base" in
    AGENTS.md) limit=$DOC_LIMIT_AGENTS ;;
    CLAUDE.md) limit=$DOC_LIMIT_CLAUDE ;;
    PROJECT.md) limit=$DOC_LIMIT_PROJECT ;;
    SESSION.md) limit=$DOC_LIMIT_SESSION ;;
    *) return 0 ;;
  esac

  local char_count
  char_count=$(wc -m < "$FILE_PATH" 2>/dev/null || echo 0)

  if [ "$char_count" -gt "$limit" ]; then
    emit_warning "PostToolUse" "${base} は編集後 ${char_count}字（上限${limit}字）です。AGENTS.mdのドキュメント字数上限を超えています。内容を削るか置き換えを検討してください。"
  fi
}

case "$HOOK_EVENT" in
  PostToolUse) check_doc_limit ;;
  *) check_read_size ;;
esac

exit 0
