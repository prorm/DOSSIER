import { env } from "../env";
import { signToken, verifyToken } from "../security/crypto";

/**
 * Signed, team-bound links into the synthetic challenge environment.
 *  - site tokens address a team's instance of a synthetic website (`/x/<token>/…`)
 *  - artifact tokens address one generated file of one node for one team
 * Purpose strings are bound into the MAC, so neither can be replayed as the
 * other (or as a QR/asset token).
 */

export const SITE_TTL_S = 12 * 60 * 60;
export const ARTIFACT_TTL_S = 30 * 60;

export interface SiteClaims extends Record<string, unknown> {
  e: string;
  t: string;
  s: string;
  exp: number;
}

export interface ArtifactClaims extends Record<string, unknown> {
  e: string;
  t: string;
  n: string;
  a: string;
  exp: number;
}

const roundUp = (s: number, to = 300) => Math.ceil(s / to) * to;

export function siteToken(eventId: string, teamId: string, siteId: string): string {
  // Expiry rounded so the token (and thus the site's origin path, cookies and storage) is stable for hours.
  return signToken(env().TOKEN_SECRET, "site", { e: eventId, t: teamId, s: siteId, exp: roundUp(Date.now() / 1000 + SITE_TTL_S, 6 * 3600) } satisfies SiteClaims);
}

export function verifySiteToken(token: string): SiteClaims | null {
  const c = verifyToken<SiteClaims>(env().TOKEN_SECRET, "site", token);
  if (!c || typeof c.e !== "string" || typeof c.t !== "string" || typeof c.s !== "string") return null;
  return c;
}

/** Base URL of a team's synthetic site. Uses SANDBOX_URL (a separate origin) when configured. */
export function siteUrl(eventId: string, teamId: string, siteId: string): string {
  const base = (process.env.SANDBOX_URL ?? "").replace(/\/$/, "");
  return `${base}/x/${siteToken(eventId, teamId, siteId)}/`;
}

export function artifactUrl(eventId: string, subject: string, nodeId: string, name: string): string {
  const tk = signToken(env().TOKEN_SECRET, "artifact", { e: eventId, t: subject, n: nodeId, a: name, exp: roundUp(Date.now() / 1000 + ARTIFACT_TTL_S) } satisfies ArtifactClaims);
  return `/api/artifacts/${tk}/${encodeURIComponent(name)}`;
}

export function verifyArtifactToken(token: string): ArtifactClaims | null {
  const c = verifyToken<ArtifactClaims>(env().TOKEN_SECRET, "artifact", token);
  if (!c || typeof c.e !== "string" || typeof c.t !== "string" || typeof c.n !== "string" || typeof c.a !== "string") return null;
  return c;
}
