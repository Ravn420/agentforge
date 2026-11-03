#!/bin/sh
# Revive contract: AgentForge preview on 0.0.0.0:8080.
set -e
if curl -sf -o /dev/null --max-time 2 http://127.0.0.1:8080/; then
  exit 0
fi
cd /workspace/af
PORT=8080 nohup ./node_modules/.bin/tsx server.ts > /tmp/agentforge.log 2>&1 &
for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30; do
  if curl -sf -o /dev/null --max-time 2 http://127.0.0.1:8080/; then
    exit 0
  fi
  sleep 1
done
echo "agentforge did not become healthy" >&2
tail -n 60 /tmp/agentforge.log >&2 || true
exit 1
