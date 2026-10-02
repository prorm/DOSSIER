/**
 * Classical encodings used by puzzle templates and by the TextSolver bot
 * (which tries to invert them). All pure and reversible where it makes sense.
 */

const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function caesar(s: string, shift: number): string {
  const k = ((shift % 26) + 26) % 26;
  return s.replace(/[A-Za-z]/g, (ch) => {
    const base = ch <= "Z" ? 65 : 97;
    return String.fromCharCode(((ch.charCodeAt(0) - base + k) % 26) + base);
  });
}

export const rot13 = (s: string) => caesar(s, 13);

export function atbash(s: string): string {
  return s.replace(/[A-Za-z]/g, (ch) => {
    const base = ch <= "Z" ? 65 : 97;
    return String.fromCharCode(25 - (ch.charCodeAt(0) - base) + base);
  });
}

export function vigenere(s: string, key: string, decrypt = false): string {
  const k = key.toUpperCase().replace(/[^A-Z]/g, "");
  if (!k) return s;
  let i = 0;
  return s.replace(/[A-Za-z]/g, (ch) => {
    const base = ch <= "Z" ? 65 : 97;
    const shift = A.indexOf(k[i++ % k.length]!);
    const off = decrypt ? 26 - shift : shift;
    return String.fromCharCode(((ch.charCodeAt(0) - base + off) % 26) + base);
  });
}

export const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");
export const unb64 = (s: string) => Buffer.from(s, "base64").toString("utf8");
export const hex = (s: string) => Buffer.from(s, "utf8").toString("hex");
export const unhex = (s: string) => Buffer.from(s.replace(/[^0-9a-f]/gi, ""), "hex").toString("utf8");
export const reverse = (s: string) => [...s].reverse().join("");

export const MORSE: Record<string, string> = {
  A: ".-", B: "-...", C: "-.-.", D: "-..", E: ".", F: "..-.", G: "--.", H: "....", I: "..", J: ".---",
  K: "-.-", L: ".-..", M: "--", N: "-.", O: "---", P: ".--.", Q: "--.-", R: ".-.", S: "...", T: "-",
  U: "..-", V: "...-", W: ".--", X: "-..-", Y: "-.--", Z: "--..",
  "0": "-----", "1": ".----", "2": "..---", "3": "...--", "4": "....-", "5": ".....",
  "6": "-....", "7": "--...", "8": "---..", "9": "----.", "-": "-....-", "/": "-..-.",
};
const MORSE_REV = Object.fromEntries(Object.entries(MORSE).map(([k, v]) => [v, k]));

export function morse(s: string): string {
  return s
    .toUpperCase()
    .split(/\s+/)
    .map((w) => [...w].map((c) => MORSE[c] ?? "").filter(Boolean).join(" "))
    .join(" / ");
}

export function unmorse(s: string): string {
  return s
    .trim()
    .split(/\s*\/\s*/)
    .map((w) => w.split(/\s+/).map((c) => MORSE_REV[c] ?? "").join(""))
    .join(" ");
}

export function a1z26(s: string): string {
  return [...s.toUpperCase()]
    .map((c) => (A.includes(c) ? String(A.indexOf(c) + 1) : c === " " ? "/" : ""))
    .filter(Boolean)
    .join("-")
    .replace(/-\/-/g, " / ");
}

export function railfence(s: string, rails: number): string {
  if (rails < 2) return s;
  const rows: string[][] = Array.from({ length: rails }, () => []);
  let r = 0;
  let dir = 1;
  for (const ch of s) {
    rows[r]!.push(ch);
    if (r === 0) dir = 1;
    else if (r === rails - 1) dir = -1;
    r += dir;
  }
  return rows.map((x) => x.join("")).join("");
}

/** RFC 4648 base32 without padding (used for DNS-label exfil). */
export function base32(data: Uint8Array | string): string {
  const bytes = typeof data === "string" ? Buffer.from(data, "utf8") : data;
  const alpha = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  let out = "";
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += alpha[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += alpha[(value << (5 - bits)) & 31];
  return out;
}

export function unbase32(s: string): Buffer {
  const alpha = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of s.toUpperCase().replace(/=+$/, "")) {
    const i = alpha.indexOf(ch);
    if (i < 0) continue;
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** Every cheap decoding a text-only solver would try on a candidate string. */
export function naiveDecodings(s: string): string[] {
  const out = new Set<string>([s, reverse(s), rot13(s), atbash(s)]);
  for (let k = 1; k < 26; k++) out.add(caesar(s, k));
  const t = s.trim();
  if (/^[A-Za-z0-9+/=\s]{8,}$/.test(t)) {
    try {
      const d = unb64(t);
      if (/^[\x20-\x7e]+$/.test(d)) out.add(d);
    } catch {
      /* not base64 */
    }
  }
  if (/^[0-9a-f\s]{6,}$/i.test(t) && t.replace(/\s/g, "").length % 2 === 0) {
    const d = unhex(t);
    if (/^[\x20-\x7e]+$/.test(d)) out.add(d);
  }
  if (/^[.\-/\s]+$/.test(t)) out.add(unmorse(t));
  if (/^[A-Z2-7]{8,}$/.test(t)) {
    const d = unbase32(t).toString("utf8");
    if (/^[\x20-\x7e]+$/.test(d)) out.add(d);
  }
  return [...out];
}
