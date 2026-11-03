# DECISIONS.md

## Choices made where the spec was silent

1. **Python version**: Spec requires 3.11+. The environment has 3.11 available at `/usr/bin/python3.11`. Tests are written against 3.11 asyncio features (`asyncio.timeout`).

2. **Account lane**: The `account` kind is seeded as a single `account:local` lease. It represents the local machine's egress IP. Budget starts at 1 and is managed identically to other kinds.

3. **Transport injection**: Offline tests inject a `transport` callable on `Router`. When none is provided, `Router._real_transport` dispatches by lease kind through `lanes.dispatch` (cf worker, proxy, browser, foreign, or direct Venice). Production Venice calls use `curl_cffi` with `impersonate="chrome"`.

4. **Semantic cache**: `sentence-transformers` is optional. On import failure the cache degrades to exact-only and logs a warning. The original last-user text is stored inside the cache payload under `_venice_src` so a digit in the query can be required to match the candidate exactly; the field is stripped before the payload is returned. Embeddings are computed on `put` when the library is present.

5. **Breaker state**: In-memory only, not persisted. Cleared on restart. Matches invariant 8 ("do not persist breaker state across restarts").

6. **Single-flight followers**: When the leader raises, followers wake and do not receive the exception (they see a normal return from the context manager). They may then retry. The server wraps the cache check and upstream call in `single_flight` so concurrent identical requests serialize and the follower re-checks the cache.

7. **CF worker KV**: The local ledger and the worker KV share the key shape `rl:<worker-id>`. Sync between them is out of scope for the local process; the worker maintains its own KV and the local process maintains SQLite. A future warmer or operator can reconcile.

8. **Browser profile**: Persistent profile path is `~/.config/venice-lane/chrome`. The lane holds an `asyncio.Lock` for concurrency cap 1, starts headless Chrome on port 9222 if needed, and issues the chat `fetch()` from page context via CDP `Runtime.evaluate`. Three consecutive disconnects disable the lane for the cycle. A watchdog respawns Chrome after `browser_idle_timeout_s` with no frame.

9. **Foreign lane**: Always seeded with `budget=999999`. Responses are tagged `venice_lane: "foreign"` and never cached. Messages are translated to the provider's OpenAI schema; Venice headers and attestation are not sent.

10. **Reset timestamp**: `next_reset_utc()` always returns a future 12:01 UTC. If `x-ratelimit-reset` is absent or in the past, this value is used. Never set to `now`. On a successful response the header's reset is recorded with `set_reset` and does **not** zero the budget; only a 429 zeroes it.

11. **Lane order**: Selection iterates `lane_order` as the outer key. The first lane that has an eligible lease supplies the candidate pool, ordered `budget DESC, last_used ASC`. An earlier lane becoming available hops off a later current lease even if that lease still has budget. `browser_hold_reserve` still keeps the browser lane unused while any non-browser lease is eligible.

12. **CF egress**: New seeds store `cf:<worker-url>` so the dispatcher can reach the worker without an index lookup. Legacy `cf:w-N` rows are still resolved against `config.cf_workers`.

13. **Proxy probe failures**: A proxy that fails its rate probe is marked for the cycle and not retried. The set is in-memory and cleared by the warmer and by `doctor`.

15. **Session pool**: Venice-bound `curl_cffi` calls borrow from a 4-session chrome-impersonating pool. A fresh session per call paid a full TLS handshake; the pool keeps fingerprints warm and is closed on shutdown.

17. **Autonomous serve**: `serve` is the long-running process. It runs the proxy, keeps the attestation pool full, reactivates expired leases every 30s, re-seeds newly configured workers, and warms at 12:00:55 UTC. No second process is required.

18. **Remaining is authoritative**: on success, `budget` is set to `x-ratelimit-remaining`, not `min(remaining, local)`. The reservation still gates the in-flight call; the header then settles the truth. A `min` after the decrement retired an IP after a single request.

20. **Zero config**: if `~/.config/venice-lane/config.toml` is missing, `load()` writes one with a generated bearer, the account lane, and the browser lane when Chrome is installed. `python -m venice` with no subcommand serves. Optional env vars (`VENICE_LANE_BEARER`, `VENICE_LANE_PORT`, `VENICE_LANE_CF_WORKERS`, `VENICE_LANE_PROXIES`, `VENICE_LANE_FOREIGN_URL`) override the file without editing it.



