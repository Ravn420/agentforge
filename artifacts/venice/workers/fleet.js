/**
 * Cloudflare Worker: same external contract as the local proxy for
 * /v1/chat/completions. Mint per attempt, hop by retrying (each retry is a
 * fresh CF egress IP). MAX_TRIES=4. KV key rl:<worker-id> holds
 * {budget, reset_at}. Reject a mismatched bearer against env.VENICE_KEY.
 */
const MODEL = "deepseek-v4-1-flash-free";
const MAX_TRIES = 4;
const MINT_URL = "https://outerface.venice.ai/api/app/user/client_attestation/mint";
const CHAT_URL = "https://outerface.venice.ai/api/inference/chat/agents/venice";

const BASE_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36",
  "Accept-Encoding": "identity",
  Origin: "https://venice.ai",
  Referer: "https://venice.ai/",
  "x-venice-locale": "en",
  "x-venice-version": "interface@20261023.172051+9e9fe40",
  "x-venice-middleface-version": "0.1.1161",
  "sec-ch-ua": '"Google Chrome";v="155", "Chromium";v="155", "Not(A:Brand";v="24"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"Windows"',
  "Content-Type": "application/json",
};

function nextReset() {
  const now = new Date();
  const c = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12, 1, 0));
  if (c.getTime() <= now.getTime()) c.setUTCDate(c.getUTCDate() + 1);
  return c.getTime();
}

async function mint() {
  const res = await fetch(MINT_URL, {
    method: "POST",
    headers: { ...BASE_HEADERS },
    body: JSON.stringify({
      count: 1,
      env: {
        nativeIntegrityOk: true,
        reactStateHash: "0",
        sentryVersion: "10.50.0",
        unexpectedGlobalsCount: 0,
        webdriver: false,
      },
    }),
  });
  if (!res.ok) return "";
  const data = await res.json();
  return data.token || "";
}

function veniceBody(messages) {
  return {
    input: {
      messages: (messages || []).map((m, i) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        status: "completed",
        type: "message",
        id: `w${Date.now().toString(36)}${i}`,
        content: [{ annotations: [], text: String(m.content || "").replace(/\0/g, " "), type: "output_text" }],
      })),
    },
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
    }
    if (url.pathname !== "/v1/chat/completions") {
      return new Response("not found", { status: 404 });
    }
    const auth = request.headers.get("Authorization") || "";
    const token = auth.replace(/^Bearer\s+/i, "");
    if (token !== env.VENICE_KEY) {
      return new Response(JSON.stringify({ error: { message: "unauthorized" } }), { status: 401 });
    }
    const body = await request.json();
    if (body.model && body.model !== MODEL) {
      return new Response(JSON.stringify({ error: { message: "model not allowlisted", code: "model_not_allowlisted" } }), { status: 400 });
    }
    if (body.usesCredits === true) {
      return new Response(JSON.stringify({ error: { message: "model not allowlisted", code: "model_not_allowlisted" } }), { status: 400 });
    }

    const workerId = env.WORKER_ID || "w-0";
    const kvKey = `rl:${workerId}`;
    // A stored budget of 0 is the last IP we saw, not every CF egress. Each
    // retry is a fresh IP, so we hop first and only declare the worker dry
    // after every attempt in this request comes back limited.
    let lastReset = nextReset();
    if (env.VENICE_KV) {
      const raw = await env.VENICE_KV.get(kvKey, "json");
      if (raw && raw.reset_at) lastReset = raw.reset_at;
    }

    let hops = 0;
    for (let i = 0; i < MAX_TRIES; i++) {
      try {
        const attestation = await mint();
        const headers = { ...BASE_HEADERS, Accept: "text/event-stream", "x-venice-distinct-id": crypto.randomUUID() };
        if (attestation) headers["x-venice-client-attestation"] = attestation;
        const chatRes = await fetch(CHAT_URL, {
          method: "POST",
          headers,
          body: JSON.stringify(veniceBody(body.messages)),
        });
        if (chatRes.status === 429 || chatRes.status === 403) {
          hops += 1;
          const reset = Number(chatRes.headers.get("x-ratelimit-reset")) || nextReset();
          lastReset = reset;
          continue;
        }
        if (!chatRes.ok) {
          hops += 1;
          continue;
        }
        if (env.VENICE_KV) {
          const remaining = chatRes.headers.get("x-ratelimit-remaining");
          const reset = chatRes.headers.get("x-ratelimit-reset");
          await env.VENICE_KV.put(kvKey, JSON.stringify({
            budget: remaining != null ? Number(remaining) : 1,
            reset_at: reset ? Number(reset) : lastReset,
          }));
        }
        const outHeaders = { "Content-Type": "text/event-stream", Connection: "close" };
        const remaining = chatRes.headers.get("x-ratelimit-remaining");
        const reset = chatRes.headers.get("x-ratelimit-reset");
        if (remaining) outHeaders["x-ratelimit-remaining"] = remaining;
        if (reset) outHeaders["x-ratelimit-reset"] = reset;
        return new Response(chatRes.body, { status: 200, headers: outHeaders });
      } catch (e) {
        hops += 1;
        continue;
      }
    }
    if (env.VENICE_KV) {
      await env.VENICE_KV.put(kvKey, JSON.stringify({ budget: 0, reset_at: lastReset }));
    }
    const retry = Math.max(1, Math.ceil((lastReset - Date.now()) / 1000));
    return new Response(JSON.stringify({ error: { message: "all lanes dry", code: "all_lanes_dry" } }), {
      status: 429,
      headers: { "Retry-After": String(retry) },
    });
  },
};
