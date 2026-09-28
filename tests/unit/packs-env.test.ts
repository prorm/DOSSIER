import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadPack } from "../../src/server/packs/load";
import { EnvError, isWeakSecret, parseEnv } from "../../src/server/env";
import { isSafeAssetPath } from "../../src/server/assets/sign";

describe("pack validation", () => {
  it("accepts the bundled example packs", async () => {
    for (const slug of ["demo-cyber-heist", "minimal-ctf"]) {
      const r = await loadPack(path.resolve("packs"), slug);
      expect(r.issues.filter((i) => i.severity === "error")).toEqual([]);
      expect(r.pack).not.toBeNull();
    }
  });

  it("reports precise file/line/field errors for a broken pack", async () => {
    const r = await loadPack(path.resolve("tests/fixtures/packs"), "broken");
    expect(r.pack).toBeNull();
    const msgs = r.issues.map((i) => `${i.file}:${i.line ?? "?"} ${i.path} ${i.message}`);
    const has = (re: RegExp) => expect(msgs.some((m) => re.test(m)), `expected ${re} in\n${msgs.join("\n")}`).toBe(true);
    has(/challenges\/bad\.yaml:\d+ .*dependency cycle: x1 → x2 → x1/);
    has(/challenges\/bad\.yaml:\d+ challenges\[2\]\.category unknown ctf category "pwn"/);
    has(/requires unknown challenge "nope"/);
    has(/asset not found: assets\/missing\.png/);
    has(/challenges\[4\]\.id ids are lowercase/);
    has(/challenges\[5\]\.answer an answer needs at least one accepted value/);
    has(/challenges\[6\]\.assets\[0\] asset paths may not contain/);
    const cycle = r.issues.find((i) => i.message.includes("cycle"))!;
    expect(cycle.line).toBe(5);
  });

  it("rejects a slug that tries to escape the packs directory", async () => {
    const r = await loadPack(path.resolve("packs"), "../etc");
    expect(r.pack).toBeNull();
  });

  it("asset path guard rejects traversal and odd segments", () => {
    expect(isSafeAssetPath("assets/a/b.png")).toBe(true);
    for (const p of ["assets/../x", "../assets/x", "assets//x", "assets/./x", "/etc/passwd", "assets\\..\\x", "assets/%2e%2e/x"]) {
      expect(isSafeAssetPath(p), p).toBe(false);
    }
  });
});

describe("environment validation", () => {
  const base = { DATABASE_URL: "postgres://x@y/z", APP_URL: "https://fest.example.org" };
  const strong = (c: string) => `${c}Qk3mZ8rT1vW6yB0nH5jL2pX9sD4fG7aE`;

  it("refuses to boot production with placeholder, short or shared secrets", () => {
    expect(() => parseEnv({ ...base, NODE_ENV: "production", SESSION_SECRET: "change-me", ANSWER_SECRET: strong("a"), TOKEN_SECRET: strong("b") })).toThrow(EnvError);
    expect(() => parseEnv({ ...base, NODE_ENV: "production", SESSION_SECRET: "short", ANSWER_SECRET: strong("a"), TOKEN_SECRET: strong("b") })).toThrow(/SESSION_SECRET/);
    expect(() => parseEnv({ ...base, NODE_ENV: "production", SESSION_SECRET: strong("a"), ANSWER_SECRET: strong("a"), TOKEN_SECRET: strong("b") })).toThrow(/must all differ/);
    expect(() => parseEnv({ ...base, NODE_ENV: "production", ANSWER_SECRET: strong("a"), TOKEN_SECRET: strong("b") })).toThrow(/SESSION_SECRET/);
  });

  it("accepts strong distinct secrets in production", () => {
    const env = parseEnv({ ...base, NODE_ENV: "production", SESSION_SECRET: strong("a"), ANSWER_SECRET: strong("b"), TOKEN_SECRET: strong("c") });
    expect(env.NODE_ENV).toBe("production");
  });

  it("classifies weak secrets", () => {
    expect(isWeakSecret("change-me-session-secret-at-least-32-characters")).toBe(true);
    expect(isWeakSecret("x".repeat(40))).toBe(true);
    expect(isWeakSecret(strong("z"))).toBe(false);
  });
});
