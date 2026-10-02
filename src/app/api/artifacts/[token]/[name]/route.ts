import { getDb } from "@/server/db/client";
import { cookieName, resolveStaffSession, resolveTeamSession } from "@/server/auth/session";
import { getEvent } from "@/server/engine/event";
import { parseCookies } from "@/server/http";
import { recordArtifact, requireCompiled, worldFor } from "@/server/game/engine";
import { verifyArtifactToken } from "@/server/game/links";
import { buildWorld, cachedWorld } from "@/server/game/world";
import { env } from "@/server/env";

export const runtime = "nodejs";

const g = globalThis as unknown as { __dossierArtifacts?: Map<string, Uint8Array> };
const cache = (g.__dossierArtifacts ??= new Map());
const MAX_BYTES = 96 * 1024 * 1024;
let cachedBytes = 0;

function remember(key: string, data: Uint8Array) {
  cache.set(key, data);
  cachedBytes += data.length;
  while (cachedBytes > MAX_BYTES && cache.size > 1) {
    const [k, v] = cache.entries().next().value!;
    cache.delete(k);
    cachedBytes -= v.length;
  }
}

function deny(status = 404) {
  return new Response("Not found", { status, headers: { "cache-control": "no-store", "content-type": "text/plain" } });
}

/**
 * Generated evidence files. The token binds event + subject + node + file; the
 * requester must be that team (or staff, for Studio previews of sample teams).
 * Files are rebuilt deterministically from the team seed and cached briefly.
 */
export async function GET(req: Request, ctx: { params: Promise<{ token: string; name: string }> }) {
  const { token, name } = await ctx.params;
  const claims = verifyArtifactToken(token);
  if (!claims || claims.a !== decodeURIComponent(name)) return deny();
  const db = await getDb();
  const cookies = parseCookies(req.headers.get("cookie"));
  const preview = claims.t.startsWith("preview:");
  if (preview) {
    const s = await resolveStaffSession(db, cookies[cookieName("staff")]);
    if (!s || s.kind !== "staff") return deny(403);
  } else {
    const t = await resolveTeamSession(db, cookies[cookieName("team")]);
    if (!t || t.team.id !== claims.t || t.team.eventId !== claims.e) return deny(403);
  }
  const event = await getEvent(db, claims.e);
  if (!event?.blueprint) return deny();
  const compiled = requireCompiled(event);
  const key = `${event.id}:${compiled.version}:${claims.t}:${claims.n}:${claims.a}`;
  let data = cache.get(key);
  let mime = "application/octet-stream";
  const world = preview
    ? await cachedWorld(`${event.id}:${compiled.version}:${claims.t}`, () => buildWorld(compiled.bp, { secret: env().ANSWER_SECRET, eventId: event.id, teamId: claims.t }))
    : await worldFor(event, compiled, claims.t);
  const ni = world.nodes.get(claims.n);
  const spec = ni?.primitive.artifacts?.(ni.instance, ni.ctx).find((a) => a.name === claims.a);
  if (!spec) return deny();
  mime = spec.mime;
  if (!data) {
    data = await spec.build();
    remember(key, data);
  }
  if (!preview) await recordArtifact(db, event, claims.t, claims.n, claims.a).catch(() => {});
  const safeName = claims.a.replace(/[^A-Za-z0-9._-]/g, "_");
  return new Response(new Uint8Array(data), {
    headers: {
      "content-type": mime,
      "content-length": String(data.length),
      "content-disposition": `attachment; filename="${safeName}"`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
      "cross-origin-resource-policy": "same-origin",
    },
  });
}
