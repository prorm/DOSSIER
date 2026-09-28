import path from "node:path";
import { env } from "../env";
import { signToken, verifyToken } from "../security/crypto";

export const ASSET_TTL_S = 10 * 60;

interface AssetClaims extends Record<string, unknown> {
  e: string; // event id (= pack slug)
  p: string; // asset path inside the pack, e.g. assets/map.png
  s: string; // subject: team id, "staff:<id>" or "public"
  exp: number;
}

/** Validates an asset path from a pack: assets/<...> with no traversal or odd segments. */
export function isSafeAssetPath(p: string): boolean {
  if (typeof p !== "string" || !/^assets\/[A-Za-z0-9._\-/]+$/.test(p)) return false;
  const segs = p.split("/");
  return !segs.some((s) => s === "" || s === "." || s === "..");
}

/** Short-lived, subject-bound URL for a pack asset. */
export function signedAssetUrl(eventId: string, assetPath: string, subject: string, ttlS = ASSET_TTL_S): string {
  // Expiry rounded up to the minute so URLs are stable (cache-friendly) within a render window.
  const exp = Math.ceil((Date.now() / 1000 + ttlS) / 60) * 60;
  const tk = signToken(env().TOKEN_SECRET, "asset", { e: eventId, p: assetPath, s: subject, exp } satisfies AssetClaims);
  return `/api/assets/${encodeURIComponent(eventId)}/${assetPath.split("/").map(encodeURIComponent).join("/")}?tk=${tk}`;
}

export function verifyAssetToken(token: string): AssetClaims | null {
  const claims = verifyToken<AssetClaims>(env().TOKEN_SECRET, "asset", token);
  if (!claims || typeof claims.e !== "string" || typeof claims.p !== "string" || typeof claims.s !== "string") return null;
  if (typeof claims.exp !== "number") return null;
  if (!isSafeAssetPath(claims.p)) return null;
  return claims;
}

/** Resolves an asset to an absolute path guaranteed to live inside packs/<eventId>/assets. */
export function resolveAssetFile(eventId: string, assetPath: string): string | null {
  if (!isSafeAssetPath(assetPath) || !/^[a-z0-9][a-z0-9-]{0,62}$/.test(eventId)) return null;
  const root = path.resolve(env().PACKS_DIR, eventId, "assets");
  const abs = path.resolve(env().PACKS_DIR, eventId, assetPath);
  if (!abs.startsWith(root + path.sep)) return null;
  return abs;
}

export const ASSET_TYPES: Record<string, { type: string; inline: boolean }> = {
  ".png": { type: "image/png", inline: true },
  ".jpg": { type: "image/jpeg", inline: true },
  ".jpeg": { type: "image/jpeg", inline: true },
  ".gif": { type: "image/gif", inline: true },
  ".webp": { type: "image/webp", inline: true },
  ".svg": { type: "image/svg+xml", inline: true },
  ".mp3": { type: "audio/mpeg", inline: true },
  ".wav": { type: "audio/wav", inline: true },
  ".txt": { type: "text/plain; charset=utf-8", inline: true },
  ".pdf": { type: "application/pdf", inline: false },
  ".zip": { type: "application/zip", inline: false },
  ".bin": { type: "application/octet-stream", inline: false },
  ".pcap": { type: "application/vnd.tcpdump.pcap", inline: false },
};
