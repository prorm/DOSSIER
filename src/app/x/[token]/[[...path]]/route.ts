import { getDb } from "@/server/db/client";
import { getEvent } from "@/server/engine/event";
import { parseCookies } from "@/server/http";
import { hitWindow } from "@/server/security/ratelimit";
import { recordDiscovery, syncTeam, worldFor } from "@/server/game/engine";
import { verifySiteToken } from "@/server/game/links";
import { siteForTeam } from "@/server/game/sites/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Synthetic challenge websites. Each team gets its own instance at
 * /x/<signed-token>/… (or on SANDBOX_URL). Everything served here is generated
 * from the team's world; cookies are path-scoped to the site, the service
 * worker's scope is the site, and the CSP forbids anything but the site's own
 * resources. Nothing here can reach DOSSIER's real session or APIs with
 * credentials (no CSRF token is ever present on these pages).
 */
const SITE_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "worker-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

function unavailable(status = 404) {
  return new Response(`<!doctype html><meta charset="utf-8"><title>Service unavailable</title><body style="font:15px system-ui;padding:40px;color:#333"><h1>Service unavailable</h1><p>This service is not reachable from your network right now.</p>`, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "content-security-policy": SITE_CSP },
  });
}

async function handle(req: Request, ctx: { params: Promise<{ token: string; path?: string[] }> }) {
  const { token, path = [] } = await ctx.params;
  const claims = verifySiteToken(token);
  if (!claims) return unavailable(404);
  const db = await getDb();
  const limit = await hitWindow(db, `site:${claims.t}`, 900, 60_000);
  if (!limit.ok) return new Response("Too many requests", { status: 429, headers: { "retry-after": String(Math.ceil(limit.retryAfterMs / 1000)) } });
  const event = await getEvent(db, claims.e);
  if (!event?.blueprint) return unavailable(404);
  let synced;
  try {
    synced = await syncTeam(db, event, claims.t);
  } catch {
    return unavailable(404);
  }
  const { ctx: ectx, state } = synced;
  if (ectx.team.status === "disqualified") return unavailable(403);
  const def = ectx.compiled.bp.sites.find((s) => s.id === claims.s);
  if (!def) return unavailable(404);
  const world = await worldFor(event, ectx.compiled, claims.t);
  const site = siteForTeam(def, world, state);
  if (!site) return unavailable(404);

  const url = new URL(req.url);
  const body = req.method === "POST" ? (await req.text()).slice(0, 16_384) : "";
  const basePath = `/x/${token}/`;
  const { res, node } = site.handle(
    { method: req.method, path: path.map((p) => decodeURIComponent(p)).join("/"), query: url.searchParams, headers: req.headers, cookies: parseCookies(req.headers.get("cookie")), body },
    basePath,
  );
  if (res.discovery && node) await recordDiscovery(db, event, claims.t, node, res.discovery.key, res.discovery.label).catch(() => false);

  const headers = new Headers({
    "content-type": res.contentType ?? "text/plain; charset=utf-8",
    "cache-control": "no-store",
    "content-security-policy": SITE_CSP,
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "x-robots-tag": "noindex, nofollow",
    "cross-origin-resource-policy": "same-origin",
  });
  for (const [k, v] of Object.entries(res.headers ?? {})) headers.set(k, v);
  for (const c of res.setCookies ?? []) headers.append("set-cookie", c.includes("Path=") ? c : `${c}; Path=${basePath}; SameSite=Lax`);
  return new Response(req.method === "HEAD" ? null : typeof res.body === "string" ? res.body : new Uint8Array(res.body), { status: res.status, headers });
}

export const GET = handle;
export const HEAD = handle;
export const POST = handle;
