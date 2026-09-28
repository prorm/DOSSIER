import { describe, expect, it } from "vitest";
import { canonicalNumber, checkAnswer, hashAnswer, makeAnswerHash, normalizeAnswer } from "../../src/server/security/answers";
import { hmacSha256, safeEqual, signToken, verifyToken } from "../../src/server/security/crypto";

const SECRET = "unit-secret-0123456789abcdefghijklmnop";

describe("answer normalization", () => {
  it("exact mode keeps case and inner spacing but trims and NFKC-normalises", () => {
    expect(normalizeAnswer("  FLAG{Ab c}  ", "flag", "exact")).toBe("FLAG{Ab c}");
    expect(normalizeAnswer("ＦＬＡＧ{x}", "flag", "exact")).toBe("FLAG{x}"); // full-width → ASCII via NFKC
  });

  it("standard mode case-folds, collapses whitespace and unifies quotes/dashes", () => {
    expect(normalizeAnswer("  The   Red\tFox ", "text", "standard")).toBe("the red fox");
    expect(normalizeAnswer("rock’n’roll — live", "text", "standard")).toBe("rock'n'roll - live");
  });

  it("loose mode drops diacritics and non-alphanumerics", () => {
    expect(normalizeAnswer("The Red-Fox!", "text", "loose")).toBe("theredfox");
    expect(normalizeAnswer("Café Déjà Vu", "text", "loose")).toBe("cafedejavu");
  });

  it("numbers canonicalise separators, signs and trailing zeros", () => {
    expect(canonicalNumber("1,000.50")).toBe("1000.5");
    expect(canonicalNumber("+0011")).toBe("11");
    expect(canonicalNumber("-0")).toBe("0");
    expect(canonicalNumber("1e3")).toBe("1000");
    expect(canonicalNumber("twelve")).toBe("");
    expect(canonicalNumber("")).toBe("");
  });
});

describe("answer checking", () => {
  it("stores HMAC(secret, salt:normalized) and matches equivalent submissions", () => {
    const h = makeAnswerHash(SECRET, "The Red Fox", "text", "loose");
    expect(h.hash).toBe(hashAnswer(SECRET, h.salt, "theredfox"));
    expect(h.hash).not.toContain("fox");
    expect(checkAnswer(SECRET, "the red-fox", "text", "loose", [h])).toBe(true);
    expect(checkAnswer(SECRET, "red fox", "text", "loose", [h])).toBe(false);
  });

  it("uses a per-answer salt so identical answers hash differently", () => {
    const a = makeAnswerHash(SECRET, "same", "text", "standard");
    const b = makeAnswerHash(SECRET, "same", "text", "standard");
    expect(a.salt).not.toBe(b.salt);
    expect(a.hash).not.toBe(b.hash);
  });

  it("a different secret never matches (secret is part of the MAC)", () => {
    const h = makeAnswerHash(SECRET, "x", "text", "standard");
    expect(checkAnswer("another-secret-0123456789abcdefghij", "x", "text", "standard", [h])).toBe(false);
  });

  it("accepts any of several alternatives and rejects empty input", () => {
    const hs = [makeAnswerHash(SECRET, "lab", "text", "loose"), makeAnswerHash(SECRET, "the lab", "text", "loose")];
    expect(checkAnswer(SECRET, "THE LAB", "text", "loose", hs)).toBe(true);
    expect(checkAnswer(SECRET, "   ", "text", "loose", hs)).toBe(false);
  });

  it("flags are case-sensitive in exact mode", () => {
    const h = makeAnswerHash(SECRET, "FLAG{One}", "flag", "exact");
    expect(checkAnswer(SECRET, "FLAG{One}", "flag", "exact", [h])).toBe(true);
    expect(checkAnswer(SECRET, "flag{one}", "flag", "exact", [h])).toBe(false);
  });

  it("numeric answers compare canonical forms", () => {
    const h = makeAnswerHash(SECRET, "1000.5", "number", "standard");
    expect(checkAnswer(SECRET, "1,000.50", "number", "standard", [h])).toBe(true);
    expect(checkAnswer(SECRET, "1000.51", "number", "standard", [h])).toBe(false);
  });
});

describe("constant-time primitives and signed tokens", () => {
  it("safeEqual compares correctly regardless of length", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });

  it("tokens round-trip, reject tampering, expiry and purpose confusion", () => {
    const t = signToken(SECRET, "asset", { a: 1 });
    expect(verifyToken(SECRET, "asset", t)).toEqual({ a: 1 });
    expect(verifyToken(SECRET, "checkpoint", t)).toBeNull();
    const [v, body, sig] = t.split(".");
    const forged = `${v}.${Buffer.from(JSON.stringify({ a: 2 })).toString("base64url")}.${sig}`;
    expect(verifyToken(SECRET, "asset", forged)).toBeNull();
    expect(verifyToken(SECRET, "asset", `${v}.${body}.${hmacSha256("wrong", "x")}`)).toBeNull();
    const expired = signToken(SECRET, "asset", { exp: Math.floor(Date.now() / 1000) - 5 });
    expect(verifyToken(SECRET, "asset", expired)).toBeNull();
    expect(verifyToken(SECRET, "asset", "garbage")).toBeNull();
  });
});
