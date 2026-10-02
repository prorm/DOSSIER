/**
 * The decoding desk's toolbox. Pure text transforms a player would otherwise
 * open a separate site for. They are *tools*, not solvers: nothing here knows
 * which transform a clue needs, what key it uses, or what the answer is – the
 * player still has to recognise the cipher and find the key.
 */

export interface CipherOp {
  id: string;
  label: string;
  hint: string;
  param?: { kind: "int"; label: string; min: number; max: number; def: number } | { kind: "text"; label: string; placeholder: string; def: string };
  run: (input: string, param: string | number) => string;
}

const A = 65;
const a = 97;
const isUpper = (c: number) => c >= A && c < A + 26;
const isLower = (c: number) => c >= a && c < a + 26;

function shift(s: string, n: number): string {
  const k = ((n % 26) + 26) % 26;
  let out = "";
  for (const ch of s) {
    const c = ch.charCodeAt(0);
    out += isUpper(c) ? String.fromCharCode(((c - A + k) % 26) + A) : isLower(c) ? String.fromCharCode(((c - a + k) % 26) + a) : ch;
  }
  return out;
}

function atbash(s: string): string {
  let out = "";
  for (const ch of s) {
    const c = ch.charCodeAt(0);
    out += isUpper(c) ? String.fromCharCode(A + 25 - (c - A)) : isLower(c) ? String.fromCharCode(a + 25 - (c - a)) : ch;
  }
  return out;
}

function vigenere(s: string, key: string, decode: boolean): string {
  const k = key.toUpperCase().replace(/[^A-Z]/g, "");
  if (!k) return s;
  let i = 0;
  let out = "";
  for (const ch of s) {
    const c = ch.charCodeAt(0);
    if (!isUpper(c) && !isLower(c)) {
      out += ch;
      continue;
    }
    const sh = k.charCodeAt(i++ % k.length) - A;
    out += shiftChar(ch, decode ? -sh : sh);
  }
  return out;
}

function shiftChar(ch: string, n: number) {
  return shift(ch, n);
}

function railDecode(s: string, rails: number): string {
  const n = s.length;
  if (rails < 2 || rails >= n) return s;
  const pattern: number[] = [];
  let r = 0;
  let dir = 1;
  for (let i = 0; i < n; i++) {
    pattern.push(r);
    if (r === 0) dir = 1;
    else if (r === rails - 1) dir = -1;
    r += dir;
  }
  const counts = Array.from({ length: rails }, (_, k) => pattern.filter((x) => x === k).length);
  const rows: string[][] = [];
  let p = 0;
  for (let k = 0; k < rails; k++) {
    rows.push([...s.slice(p, p + counts[k]!)]);
    p += counts[k]!;
  }
  const idx = Array(rails).fill(0) as number[];
  return pattern.map((k) => rows[k]![idx[k]!++]).join("");
}

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function base32Decode(s: string): string {
  const clean = s.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = "";
  for (const ch of clean) bits += B32.indexOf(ch).toString(2).padStart(5, "0");
  let out = "";
  for (let i = 0; i + 8 <= bits.length; i += 8) out += String.fromCharCode(parseInt(bits.slice(i, i + 8), 2));
  return out;
}

const MORSE: Record<string, string> = {
  ".-": "A", "-...": "B", "-.-.": "C", "-..": "D", ".": "E", "..-.": "F", "--.": "G", "....": "H", "..": "I", ".---": "J", "-.-": "K", ".-..": "L", "--": "M",
  "-.": "N", "---": "O", ".--.": "P", "--.-": "Q", ".-.": "R", "...": "S", "-": "T", "..-": "U", "...-": "V", ".--": "W", "-..-": "X", "-.--": "Y", "--..": "Z",
  "-----": "0", ".----": "1", "..---": "2", "...--": "3", "....-": "4", ".....": "5", "-....": "6", "--...": "7", "---..": "8", "----.": "9",
};
function morseDecode(s: string): string {
  return s
    .trim()
    .split(/\s*\/\s*|\s{3,}/)
    .map((w) => w.split(/\s+/).map((c) => MORSE[c] ?? "?").join(""))
    .join(" ");
}

export const OPS: CipherOp[] = [
  { id: "atbash", label: "Atbash", hint: "Mirror the alphabet: A↔Z, B↔Y…", run: (s) => atbash(s) },
  { id: "caesar", label: "Caesar shift", hint: "Rotate every letter by N places.", param: { kind: "int", label: "shift", min: -25, max: 25, def: 3 }, run: (s, n) => shift(s, Number(n)) },
  { id: "rot13", label: "ROT13", hint: "Caesar with a shift of 13 (its own inverse).", run: (s) => shift(s, 13) },
  { id: "reverse", label: "Reverse", hint: "Read the text backwards.", run: (s) => [...s].reverse().join("") },
  { id: "vigenere", label: "Vigenère (decode)", hint: "Polyalphabetic: needs the keyword.", param: { kind: "text", label: "key", placeholder: "KEYWORD", def: "" }, run: (s, k) => vigenere(s, String(k), true) },
  { id: "rail", label: "Rail fence (decode)", hint: "Zig-zag transposition across N rails.", param: { kind: "int", label: "rails", min: 2, max: 10, def: 3 }, run: (s, n) => railDecode(s, Number(n)) },
  { id: "base64", label: "Base64 →", hint: "Decode Base64 text.", run: (s) => { try { return atob(s.trim()); } catch { return "⚠ not valid Base64"; } } },
  { id: "base32", label: "Base32 →", hint: "Decode RFC 4648 Base32 text.", run: (s) => base32Decode(s) },
  { id: "hex", label: "Hex →", hint: "Decode pairs of hex digits into characters.", run: (s) => (s.replace(/[^0-9a-f]/gi, "").match(/../g) ?? []).map((h) => String.fromCharCode(parseInt(h, 16))).join("") },
  { id: "binary", label: "Binary →", hint: "Decode 8-bit groups into characters.", run: (s) => (s.replace(/[^01]/g, "").match(/.{8}/g) ?? []).map((b) => String.fromCharCode(parseInt(b, 2))).join("") },
  { id: "morse", label: "Morse →", hint: "Dots and dashes; spaces between letters, / between words.", run: (s) => morseDecode(s) },
  { id: "upper", label: "UPPERCASE", hint: "Normalise case.", run: (s) => s.toUpperCase() },
  { id: "strip", label: "Strip spaces", hint: "Remove all whitespace.", run: (s) => s.replace(/\s+/g, "") },
];

export const OP_BY_ID = new Map(OPS.map((o) => [o.id, o]));

export interface RecipeStep {
  op: string;
  param: string | number;
}

/** Runs a recipe and returns the text after every step (the "transformation states"). */
export function runRecipe(input: string, steps: RecipeStep[]): string[] {
  const out: string[] = [];
  let cur = input;
  for (const s of steps) {
    const op = OP_BY_ID.get(s.op);
    cur = op ? op.run(cur, s.param) : cur;
    out.push(cur);
  }
  return out;
}

/** Ciphertext-looking fragments in a clue: inline code spans, most useful first. */
export function extractFragments(markdown: string): string[] {
  const found = [...markdown.matchAll(/`([^`\n]{3,120})`/g)].map((m) => m[1]!.trim());
  const seen = new Set<string>();
  return found.filter((f) => (seen.has(f) ? false : (seen.add(f), true)));
}
