#!/bin/bash
#
# BFF Auth Flow — Manual curl 測試指南
#
# Prerequisites:
#   1. rumors-api running locally on port 5000
#   2. .env 設定:
#      - JWT_SECRET=<至少32字元的密鑰>
#      - ALLOWED_CALLBACK_URLS=http://localhost:3987/callback
#      - GITHUB_CLIENT_ID / GITHUB_SECRET / GITHUB_CALLBACK_URL 已設定
#
# ════════════════════════════════════════════════════════════════════════════

API=http://localhost:5000

echo "═══════════════════════════════════════════════════"
echo "  BFF Auth Flow — Manual curl Test"
echo "═══════════════════════════════════════════════════"
echo ""

# ─── Step 0: 健康檢查 ──────────────────────────────────────────────────────
echo "▶ Step 0: Health check"
echo "  curl -s -o /dev/null -w '%{http_code}' $API/"
HTTP_CODE=$(curl -s -o /dev/null -w '%{http_code}' $API/)
if [ "$HTTP_CODE" = "200" ]; then
  echo "  ✓ API is running (HTTP $HTTP_CODE)"
else
  echo "  ✗ API not reachable (HTTP $HTTP_CODE). Start it first!"
  exit 1
fi
echo ""

# ─── Step 1: 開啟瀏覽器走 OAuth ────────────────────────────────────────────
CALLBACK_URL="http://localhost:3987/callback"
STATE="/article/test-manual"

echo "▶ Step 1: OAuth Login"
echo ""
echo "  在瀏覽器打開以下 URL:"
echo ""
echo "    ${API}/login/github?redirect_to=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$CALLBACK_URL', safe=''))")&state=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$STATE', safe=''))")"
echo ""
echo "  完成 GitHub 登入後，瀏覽器會被 redirect 到："
echo "    http://localhost:3987/callback?code=<JWT>&state=/article/test-manual"
echo ""
echo "  ⚠ 這個 URL 會打不開（因為沒有 server 在 3987），但沒關係！"
echo "  從瀏覽器的網址列複製 'code' 參數的值。"
echo ""
echo "  小技巧：如果瀏覽器顯示無法連線，網址列裡還是會有完整 URL。"
echo ""
read -p "  貼上 code 的值 (JWT): " CODE
echo ""

if [ -z "$CODE" ]; then
  echo "  ✗ No code provided. Aborting."
  exit 1
fi

# ─── Step 2: Token Exchange ─────────────────────────────────────────────────
echo "▶ Step 2: Exchange code for long-lived token"
echo ""
echo "  curl -X POST $API/auth/token \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    -d '{\"code\": \"<your-code>\"}'"
echo ""

TOKEN_RESPONSE=$(curl -s -X POST "$API/auth/token" \
  -H 'Content-Type: application/json' \
  -d "{\"code\": \"$CODE\"}")

echo "  Response: $TOKEN_RESPONSE"
echo ""

# Extract token (works with jq or python3)
TOKEN=""
if command -v jq &>/dev/null; then
  TOKEN=$(echo "$TOKEN_RESPONSE" | jq -r '.token // empty')
elif command -v python3 &>/dev/null; then
  TOKEN=$(echo "$TOKEN_RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('token',''))" 2>/dev/null)
fi

if [ -z "$TOKEN" ]; then
  echo "  ✗ Failed to get token. Response: $TOKEN_RESPONSE"
  echo ""
  echo "  如果 code 已過期（30秒），需要重新走 Step 1。"
  exit 1
fi

echo "  ✓ Got long-lived token!"
echo "  Token: ${TOKEN:0:50}..."
echo ""

# ─── Step 3: GraphQL with Bearer ───────────────────────────────────────────
echo "▶ Step 3: GraphQL query with Bearer token"
echo ""
echo "  curl -X POST $API/graphql \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    -H 'Authorization: Bearer <token>' \\"
echo "    -H 'x-app-id: RUMORS_SITE' \\"
echo "    -d '{\"query\": \"{ GetUser { id name avatarUrl } }\"}'"
echo ""

GQL_RESPONSE=$(curl -s -X POST "$API/graphql" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'x-app-id: RUMORS_SITE' \
  -d '{"query": "{ GetUser { id name avatarUrl } }"}')

echo "  Response:"
if command -v jq &>/dev/null; then
  echo "$GQL_RESPONSE" | jq .
else
  echo "  $GQL_RESPONSE"
fi
echo ""

# Check if we got a user
USER_ID=""
if command -v jq &>/dev/null; then
  USER_ID=$(echo "$GQL_RESPONSE" | jq -r '.data.GetUser.id // empty')
fi

if [ -n "$USER_ID" ]; then
  echo "  ✓ Authenticated as user: $USER_ID"
else
  echo "  ⚠ Could not verify user ID (install jq for auto-check, or verify manually above)"
fi
echo ""

# ─── Step 4: Edge cases ────────────────────────────────────────────────────
echo "▶ Step 4: Edge case tests"
echo ""

echo "  4a. Missing code:"
echo "  curl -X POST $API/auth/token -H 'Content-Type: application/json' -d '{}'"
MISSING=$(curl -s -X POST "$API/auth/token" -H 'Content-Type: application/json' -d '{}')
echo "  → $MISSING"
echo ""

echo "  4b. Invalid code:"
echo "  curl -X POST $API/auth/token -H 'Content-Type: application/json' -d '{\"code\": \"garbage\"}'"
INVALID=$(curl -s -X POST "$API/auth/token" -H 'Content-Type: application/json' -d '{"code": "garbage"}')
echo "  → $INVALID"
echo ""

echo "  4c. Invalid Bearer token:"
echo "  curl -X POST $API/graphql -H 'Authorization: Bearer garbage' -H 'x-app-id: RUMORS_SITE' ..."
GQL_BAD=$(curl -s -X POST "$API/graphql" \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer garbage' \
  -H 'x-app-id: RUMORS_SITE' \
  -d '{"query": "{ GetUser { id } }"}')
echo "  → $GQL_BAD"
echo ""

echo "  4d. No auth (should be anonymous, no crash):"
GQL_ANON=$(curl -s -X POST "$API/graphql" \
  -H 'Content-Type: application/json' \
  -H 'x-app-id: RUMORS_SITE' \
  -d '{"query": "{ GetUser { id } }"}')
echo "  → $GQL_ANON"
echo ""

echo "  4e. Disallowed redirect_to:"
echo "  curl -s -o /dev/null -w '%{http_code}' '$API/login/github?redirect_to=https://evil.com/steal'"
EVIL=$(curl -s -o /dev/null -w '%{http_code}' "$API/login/github?redirect_to=https://evil.com/steal")
echo "  → HTTP $EVIL (expect 400)"
echo ""

# ─── Summary ────────────────────────────────────────────────────────────────
echo "═══════════════════════════════════════════════════"
echo "  Done! Tokens for further testing:"
echo "═══════════════════════════════════════════════════"
echo ""
echo "Long-lived JWT (valid ~14 days):"
echo "  $TOKEN"
echo ""
echo "Quick copy-paste:"
echo ""
echo "  # GraphQL query"
echo "  curl -X POST $API/graphql \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    -H 'Authorization: Bearer $TOKEN' \\"
echo "    -H 'x-app-id: RUMORS_SITE' \\"
echo "    -d '{\"query\": \"{ GetUser { id name } }\"}'"
echo ""
echo "  # ListArticles (verify auth context)"
echo "  curl -X POST $API/graphql \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    -H 'Authorization: Bearer $TOKEN' \\"
echo "    -H 'x-app-id: RUMORS_SITE' \\"
echo "    -d '{\"query\": \"{ ListArticles(first: 1) { totalCount edges { node { id text } } } }\"}'"
