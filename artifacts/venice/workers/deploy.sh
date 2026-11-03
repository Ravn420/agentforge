#!/usr/bin/env bash
# Deploy N workers, one per Cloudflare account egress.
# Requires CF_API_TOKEN, CF_ACCOUNT_ID, VENICE_KEY.
# Usage: ./workers/deploy.sh [count] [name-prefix]
# Prints the URLs to paste into config.toml cf_workers.
set -euo pipefail
: "${CF_API_TOKEN:?}"
: "${CF_ACCOUNT_ID:?}"
: "${VENICE_KEY:?}"

COUNT="${1:-4}"
PREFIX="${2:-venice-lane}"

echo "deploying ${COUNT} workers"
for i in $(seq 0 $((COUNT - 1))); do
  NAME="${PREFIX}-${i}"
  echo "-> ${NAME}"
  npx wrangler deploy workers/fleet.js --name "$NAME" \
    --var VENICE_KEY:"$VENICE_KEY" \
    --var WORKER_ID:"w-${i}" \
    || echo "wrangler not available; deploy ${NAME} manually"
done
echo
echo "add the printed *.workers.dev URLs to cf_workers in ~/.config/venice-lane/config.toml"
echo "then: python -m venice.cli serve"
