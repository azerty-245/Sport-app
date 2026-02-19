#!/bin/bash
# Fix CORS headers on /stream endpoint to survive Cloudflare tunnel
PROXY=/home/ubuntu/sport-app-sync/proxy.js

# 1. Fix nocode path: set CORS headers before piping
sed -i 's|const response = await axios({ method: '\''get'\'', url, responseType: '\''stream'\'', timeout: 5000 });|const response = await axios({ method: '\''get'\'', url, responseType: '\''stream'\'', timeout: 5000 });\n            res.setHeader('\''Access-Control-Allow-Origin'\'', '\''*'\'');\n            res.setHeader('\''Content-Type'\'', '\''video/mp2t'\'');|' "$PROXY"

# 2. Verify the middleware still has no Credentials header
grep -n "Access-Control" "$PROXY"

pm2 restart streaming-proxy
echo "=== FIX APPLIED ==="
