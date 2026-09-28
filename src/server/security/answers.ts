import { hmacSha256, randomToken, safeEqual } from "./crypto";

export type AnswerType = "text" | "flag" | "number";
export type NormalizeMode = "loose" | "standard" | "exact";

/**
 * Answer normalization semantics (documented in docs/PACK_AUTHORING.md):
 *
 *  exact    — Unicode NFKC + trim. Case and inner spacing matter. Default for CTF flags.
 *  standard — NFKC, trim, case-fold, collapse runs of whitespace to one space,
 *             normalise curly quotes/dashes. Default for text answers.
 *  loose    — standard + strip diacritics + drop everything that is not a letter
 *             or digit ("The Red-Fox!" ≡ "the red fox" ≡ "theredfox"). Hunt-friendly.
 *
 *  number   — parsed as a decimal; canonical form drops +, leading zeros, trailing
 *             fractional zeros, thousands separators ("1,000.50" ≡ "1000.5").
 *             Non-numeric input normalizes to "" and can never match.
 */
export function normalizeAnswer(raw: string, type: AnswerType, mode: NormalizeMode): string {
  let s = String(raw ?? "").normalize("NFKC").trim();
  if (type === "number") return canonicalNumber(s);
  if (mode === "exact") return s;
  s = s
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[‐-―−]/g, "-")
    .toLocaleLowerCase("en-US")
    .replace(/\s+/g, " ");
  if (mode === "loose") {
    s = s
      .normalize("NFKD")
      .replace(/\p{M}+/gu, "")
      .replace(/[^\p{L}\p{N}]+/gu, "");
  }
  return s;
}

export function canonicalNumber(s: string): string {
  const cleaned = s.replace(/[,_\s]/g, "");
  if (!/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(cleaned)) return "";
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return "";
  // Up to 12 significant fractional digits, no trailing zeros, no "-0".
  const fixed = Object.is(n, -0) ? "0" : String(Number(n.toPrecision(15)));
  return fixed;
}

export interface AnswerHash {
  salt: string;
  hash: string;
}

/** HMAC-SHA256(ANSWER_SECRET, salt ‖ ":" ‖ normalized). */
export function hashAnswer(secret: string, salt: string, normalized: string): string {
  return hmacSha256(secret, `${salt}:${normalized}`);
}

export function makeAnswerHash(secret: string, raw: string, type: AnswerType, mode: NormalizeMode): AnswerHash {
  const salt = randomToken(16);
  return { salt, hash: hashAnswer(secret, salt, normalizeAnswer(raw, type, mode)) };
}

/**
 * Checks a submission against every accepted answer in constant time per
 * candidate. We deliberately evaluate all candidates (no early exit) so the
 * response time does not reveal which alternative matched.
 */
export function checkAnswer(
  secret: string,
  submitted: string,
  type: AnswerType,
  mode: NormalizeMode,
  accepted: AnswerHash[],
): boolean {
  const normalized = normalizeAnswer(submitted, type, mode);
  let ok = false;
  for (const a of accepted) {
    const match = safeEqual(hashAnswer(secret, a.salt, normalized), a.hash);
    ok = ok || (match && normalized.length > 0);
  }
  return ok;
}

/** Event-wide keyed fingerprint of a submission (for "shared wrong answer" detection). */
export function submissionFingerprint(secret: string, challengeId: string, submitted: string, type: AnswerType, mode: NormalizeMode) {
  return hmacSha256(secret, `fp:${challengeId}:${normalizeAnswer(submitted, type, mode)}`);
}
