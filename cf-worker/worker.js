/**
 * Hosted chat proxy for the AI 桌游主持人 app.
 *
 * Purpose: let visitors use the app without their own Volcengine Ark API key.
 * The real key lives only here, as a Worker secret — it never reaches the browser
 * and never enters git history, unlike hardcoding it in index.html would.
 *
 * Deploy: see cf-worker/README.md.
 */

const ALLOWED_ORIGIN = "https://REPLACE-WITH-YOUR-GITHUB-PAGES-ORIGIN"; // e.g. "https://jing0712.github.io"
const ARK_URL = "https://ark.cn-beijing.volces.com/api/v3/chat/completions";
const DEFAULT_MODEL = "REPLACE-WITH-YOUR-ARK-ENDPOINT-ID"; // used when the client doesn't send one
const RATE_LIMIT_PER_HOUR = 20; // requests per visitor IP — tune to your budget

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin === ALLOWED_ORIGIN ? origin : "",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-App-Token",
    "Vary": "Origin",
  };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const headers = corsHeaders(origin);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405, headers });
    }
    if (origin !== ALLOWED_ORIGIN) {
      return new Response(JSON.stringify({ error: "origin not allowed" }), {
        status: 403, headers: { ...headers, "Content-Type": "application/json" },
      });
    }
    if (request.headers.get("X-App-Token") !== env.APP_TOKEN) {
      return new Response(JSON.stringify({ error: "invalid app token" }), {
        status: 401, headers: { ...headers, "Content-Type": "application/json" },
      });
    }

    // Basic per-IP rate limit (per hour bucket) so one visitor can't run up the bill.
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    const bucketKey = `rl:${ip}:${new Date().toISOString().slice(0, 13)}`;
    const current = parseInt((await env.RATE_LIMIT.get(bucketKey)) || "0", 10);
    if (current >= RATE_LIMIT_PER_HOUR) {
      return new Response(JSON.stringify({ error: "rate limit exceeded, try again later" }), {
        status: 429, headers: { ...headers, "Content-Type": "application/json" },
      });
    }
    await env.RATE_LIMIT.put(bucketKey, String(current + 1), { expirationTtl: 3600 });

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return new Response(JSON.stringify({ error: "invalid json" }), {
        status: 400, headers: { ...headers, "Content-Type": "application/json" },
      });
    }

    const upstreamRes = await fetch(ARK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + env.ARK_API_KEY,
      },
      body: JSON.stringify({
        model: body.model || DEFAULT_MODEL,
        messages: body.messages,
        temperature: typeof body.temperature === "number" ? body.temperature : 0.7,
      }),
    });

    const text = await upstreamRes.text();
    return new Response(text, {
      status: upstreamRes.status,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  },
};
