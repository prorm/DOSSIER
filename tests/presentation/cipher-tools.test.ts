import { describe, expect, it } from "vitest";
import { OP_BY_ID, extractFragments, runRecipe } from "../../src/lib/experience/cipher-tools";

const run = (op: string, s: string, p: string | number = "") => OP_BY_ID.get(op)!.run(s, p);

describe("decoding desk tools", () => {
  it("atbash mirrors the alphabet and is its own inverse", () => {
    expect(run("atbash", "ORCHID")).toBe("LIXSRW");
    expect(run("atbash", run("atbash", "Hello, World"))).toBe("Hello, World");
  });

  it("caesar and rot13 rotate letters and keep everything else", () => {
    expect(run("caesar", "Attack at dawn!", 3)).toBe("Dwwdfn dw gdzq!");
    expect(run("caesar", "Dwwdfn dw gdzq!", -3)).toBe("Attack at dawn!");
    expect(run("rot13", run("rot13", "Kestrel"))).toBe("Kestrel");
  });

  it("vigenère decodes with the keyword, ignoring non-letters for key advance", () => {
    // ATTACKATDAWN with key LEMON → LXFOPVEFRNHR (classic example)
    expect(run("vigenere", "LXFOPVEFRNHR", "LEMON")).toBe("ATTACKATDAWN");
    expect(run("vigenere", "LXF OPV", "LEMON")).toBe("ATT ACK");
    expect(run("vigenere", "ABC", "")).toBe("ABC");
  });

  it("rail fence decodes the classic WEAREDISCOVERED example", () => {
    expect(run("rail", "WECRLTEERDSOEEFEAOCAIVDEN", 3)).toBe("WEAREDISCOVEREDFLEEATONCE");
  });

  it("decodes base64, base32, hex, binary and morse", () => {
    expect(run("base64", "S2VzdHJlbA==")).toBe("Kestrel");
    expect(run("base64", "%%%")).toContain("not valid");
    expect(run("base32", "JBSWY3DPEBLW64TMMQ======")).toBe("Hello World");
    expect(run("hex", "4b 65 73 74")).toBe("Kest");
    expect(run("binary", "01001000 01101001")).toBe("Hi");
    expect(run("morse", "-.- . ... - .-. . .-.. / --- -.-.")).toBe("KESTREL OC");
  });

  it("chains steps and reports every intermediate state", () => {
    const states = runRecipe("LIXSRW", [
      { op: "atbash", param: "" },
      { op: "caesar", param: 1 },
    ]);
    expect(states).toEqual(["ORCHID", "PSDIJE"]);
  });

  it("finds ciphertext-looking fragments in a clue, once each", () => {
    const md = "The preamble arrived mirrored: **`LIXSRW`** — then `abc def` and again `LIXSRW`. Ignore `xy`.";
    expect(extractFragments(md)).toEqual(["LIXSRW", "abc def"]);
  });
});
