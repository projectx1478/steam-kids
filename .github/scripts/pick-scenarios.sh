#!/usr/bin/env bash
# 使い方: pick-scenarios.sh "<空白区切りの指定>" [<必ず含めるシナリオ>...]
# 出力: 標準出力に「フラグ シナリオ名…」（重複除去・存在確認済み）。
# 許可するのは実在するシナリオ名と --mobile / --shot のみ（シェル注入対策）。最大 MAX_EXTRA 本。
set -euo pipefail
set -f  # * などのグロブ展開を無効化
MAX_EXTRA=${MAX_EXTRA:-12}
REQUEST="${1:-}"; shift || true
flags=(); names=("$@"); extra=0
for t in $REQUEST; do
  case "$t" in
    --mobile|--shot) flags+=("$t") ;;
    *)
      if [[ "$t" =~ ^[a-z0-9-]+$ ]] && [ -f ".claude/verify/scenarios/$t.mjs" ]; then
        if [ "$extra" -lt "$MAX_EXTRA" ]; then names+=("$t"); extra=$((extra+1));
        else echo "::warning::上限${MAX_EXTRA}本を超えたため無視: $t" >&2; fi
      else
        echo "::warning::存在しないシナリオ名を無視: $t" >&2
      fi ;;
  esac
done
uniq_names=$(printf '%s\n' "${names[@]}" | awk 'NF && !seen[$0]++' | tr '\n' ' ')
uniq_flags=$(printf '%s\n' "${flags[@]:-}" | awk 'NF && !seen[$0]++' | tr '\n' ' ')
echo "${uniq_flags}${uniq_names}" | xargs
