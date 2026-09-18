#!/usr/bin/env bash
# Issue #20 完了条件の手動curl確認。Codespaces等、実ネットワークに出られる環境で実行する。
# 使い捨てのテストデータのみを使う。実行後はAI側でD1から削除する。
set -u
BASE="https://steam-kids-sync.projectx1478.workers.dev"
LEARNER_A="11111111-1111-4111-8111-111111111111"
SECRET_A="AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
SECRET_B="BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB"

echo "== 1. register A (expect 200) =="
curl -s -o /tmp/r1 -w "status=%{http_code}\n" -X POST "$BASE/register" -H 'Content-Type: application/json' \
  -d "{\"learnerId\":\"$LEARNER_A\",\"syncSecret\":\"$SECRET_A\"}"
cat /tmp/r1; echo

echo "== 2. push 3 events (expect acceptedCount:3) =="
curl -s -o /tmp/r2 -w "status=%{http_code}\n" -X POST "$BASE/sync" \
  -H "Authorization: Bearer $LEARNER_A.$SECRET_A" -H 'Content-Type: application/json' \
  -d '{"events":[
    {"eventId":"e1","lessonId":"cmd-01","stepId":"s1","type":"step_enter","ts":1000,"payload":{}},
    {"eventId":"e2","lessonId":"cmd-01","stepId":"s1","type":"predict","ts":2000,"payload":{"correct":true}},
    {"eventId":"e3","lessonId":"cmd-01","stepId":"s2","type":"step_enter","ts":3000,"payload":{}}
  ]}'
cat /tmp/r2; echo

echo "== 3. re-push same 3 (expect acceptedCount:0) =="
curl -s -o /tmp/r3 -w "status=%{http_code}\n" -X POST "$BASE/sync" \
  -H "Authorization: Bearer $LEARNER_A.$SECRET_A" -H 'Content-Type: application/json' \
  -d '{"events":[
    {"eventId":"e1","lessonId":"cmd-01","stepId":"s1","type":"step_enter","ts":1000,"payload":{}},
    {"eventId":"e2","lessonId":"cmd-01","stepId":"s1","type":"predict","ts":2000,"payload":{"correct":true}},
    {"eventId":"e3","lessonId":"cmd-01","stepId":"s2","type":"step_enter","ts":3000,"payload":{}}
  ]}'
cat /tmp/r3; echo

echo "== 4. get since=0 (expect 3 events, ts asc) =="
curl -s -o /tmp/r4 -w "status=%{http_code}\n" "$BASE/sync?since=0" -H "Authorization: Bearer $LEARNER_A.$SECRET_A"
cat /tmp/r4; echo

echo "== 5. issue link code (expect 6-char code, no 0/O/1/I) =="
curl -s -o /tmp/r5 -w "status=%{http_code}\n" -X POST "$BASE/link/issue" -H "Authorization: Bearer $LEARNER_A.$SECRET_A"
cat /tmp/r5; echo
CODE=$(node -e "console.log(JSON.parse(require('fs').readFileSync('/tmp/r5','utf8')).code)")
echo "CODE=$CODE"

echo "== 6. redeem with device B (expect learnerId == A) =="
curl -s -o /tmp/r6 -w "status=%{http_code}\n" -X POST "$BASE/link/redeem" -H 'Content-Type: application/json' \
  -d "{\"code\":\"$CODE\",\"syncSecret\":\"$SECRET_B\"}"
cat /tmp/r6; echo

echo "== 7. redeem same code again (expect 410) =="
curl -s -o /tmp/r7 -w "status=%{http_code}\n" -X POST "$BASE/link/redeem" -H 'Content-Type: application/json' \
  -d "{\"code\":\"$CODE\",\"syncSecret\":\"CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC\"}"
cat /tmp/r7; echo

echo "== 8. device B pulls A's events (expect 3 events) =="
curl -s -o /tmp/r8 -w "status=%{http_code}\n" "$BASE/sync?since=0" -H "Authorization: Bearer $LEARNER_A.$SECRET_B"
cat /tmp/r8; echo

echo "== 9. wrong secret (expect 401) =="
curl -s -o /tmp/r9 -w "status=%{http_code}\n" -X POST "$BASE/sync" \
  -H "Authorization: Bearer $LEARNER_A.WRONGWRONGWRONGWRONGWRONGWRONGWRONGWRONGWR" -H 'Content-Type: application/json' \
  -d '{"events":[]}'
cat /tmp/r9; echo

echo "== done. 上の出力をすべてClaudeに貼ってください =="
