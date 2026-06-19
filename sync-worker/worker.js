/**
 * Recall·Queue cross-device sync — Cloudflare Worker.
 *
 * Stores the app's single JSON state blob under one KV key, gated behind a
 * bearer secret. GET returns the blob; PUT replaces it. Both reads and writes
 * require the secret, so a stranger who finds the URL can neither read nor
 * mutate your progress.
 *
 * Deploy on the FREE plan (no billing attached) — when limits are exceeded the
 * Worker simply returns errors until the daily reset; it can never cost money.
 *
 * Bindings expected (see wrangler.toml):
 *   - KV namespace bound as STATE
 *   - secret bound as SYNC_SECRET  (set via: wrangler secret put SYNC_SECRET)
 */

const ALLOWED_ORIGIN = "https://in0x.github.io"; // the GitHub Pages origin
const MIN_WRITE_INTERVAL_MS = 2000; // server-side guard against write storms
const MAX_BYTES = 5_000_000; // reject absurd payloads

export default {
  async fetch(request, env) {
    const cors = {
      "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
      "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Access-Control-Max-Age": "86400",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    // --- auth gate: runs before we ever touch KV ---
    const auth = request.headers.get("Authorization") || "";
    const presented = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!env.SYNC_SECRET || presented !== env.SYNC_SECRET) {
      return new Response("Unauthorized", { status: 401, headers: cors });
    }

    if (request.method === "GET") {
      const body = await env.STATE.get("state");
      return new Response(body || "", {
        status: body ? 200 : 204, // 204 = no remote state stored yet
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    if (request.method === "PUT") {
      const last = Number(await env.STATE.get("lastWriteAt")) || 0;
      if (Date.now() - last < MIN_WRITE_INTERVAL_MS) {
        return new Response("Too Many Requests", { status: 429, headers: cors });
      }
      const text = await request.text();
      if (text.length > MAX_BYTES) {
        return new Response("Payload too large", { status: 413, headers: cors });
      }
      await env.STATE.put("state", text);
      await env.STATE.put("lastWriteAt", String(Date.now()));
      return new Response("OK", { status: 200, headers: cors });
    }

    return new Response("Method not allowed", { status: 405, headers: cors });
  },
};
