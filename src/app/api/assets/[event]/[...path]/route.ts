import fs from "node:fs/promises";
import path from "node:path";
import { getDb } from "@/server/db/client";
import { ASSET_TYPES, resolveAssetFile, verifyAssetToken } from "@/server/assets/sign";
import { cookieName, resolveStaffSession, resolveTeamSession } from "@/server/auth/session";
import { parseCookies } from "@/server/http";

export const runtime = "nodejs";

function deny(status = 404) {
  // Uniform response: never reveal whether an asset exists.
  return new Response("Not found", { status, headers: { "cache-control": "no-store", "content-type": "text/plain" } });
}

/**
 * Signed, short-lived, subject-bound pack assets.
 *  1. token must verify (HMAC, purpose "asset", not expired)
 *  2. token must be for exactly this event + path
 *  3. the requester must BE the subject (same team session, or staff)
 *  4. the resolved file must live inside packs/<event>/assets (no traversal, no symlinks)
 */
export async function GET(req: Request, ctx: { params: Promise<{ event: string; path: string[] }> }) {
  const { event, path: segs } = await ctx.params;
  const url = new URL(req.url);
  const claims = verifyAssetToken(url.searchParams.get("tk") ?? "");
  const assetPath = segs.map((s) => decodeURIComponent(s)).join("/");
  if (!claims || claims.e !== event || claims.p !== assetPath) return deny();

  const db = await getDb();
  const cookies = parseCookies(req.headers.get("cookie"));
  if (claims.s.startsWith("staff:")) {
    const s = await resolveStaffSession(db, cookies[cookieName("staff")]);
    if (!s || s.kind !== "staff" || `staff:${s.staff.id}` !== claims.s) return deny(403);
  } else if (claims.s !== "public") {
    const t = await resolveTeamSession(db, cookies[cookieName("team")]);
    if (!t || t.team.id !== claims.s) return deny(403);
  }

  const abs = resolveAssetFile(event, assetPath);
  if (!abs) return deny();
  let data: Buffer;
  try {
    const st = await fs.lstat(abs);
    if (!st.isFile()) return deny();
    data = await fs.readFile(abs);
  } catch {
    return deny();
  }
  const ext = path.extname(abs).toLowerCase();
  const type = ASSET_TYPES[ext] ?? { type: "application/octet-stream", inline: false };
  const name = path.basename(abs).replace(/[^A-Za-z0-9._-]/g, "_");
  const download = url.searchParams.get("download") === "1" || !type.inline;
  return new Response(new Uint8Array(data), {
    headers: {
      "content-type": type.type,
      "content-length": String(data.length),
      "content-disposition": `${download ? "attachment" : "inline"}; filename="${name}"`,
      "cache-control": "private, max-age=300",
      "x-content-type-options": "nosniff",
      // SVGs and anything else rendered directly can never run script or load resources.
      "content-security-policy": "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox",
      "cross-origin-resource-policy": "same-origin",
    },
  });
}
