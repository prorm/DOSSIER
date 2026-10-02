import { a1z26, atbash, b64, base32, caesar, hex, morse, railfence, reverse, rot13, vigenere } from "./ciphers";

/**
 * Fact templates: `{{factName}}`, `{{node.output}}`, `{{fact | caesar:3 | upper}}`,
 * `{{fact | vigenere:@otherFact}}`. Templates are *data*: the only operations
 * available are the pure transforms below. Nothing authored is ever evaluated
 * as code.
 */

export type Facts = Record<string, string>;

export class TemplateError extends Error {
  constructor(
    message: string,
    public readonly ref?: string,
  ) {
    super(message);
    this.name = "TemplateError";
  }
}

const RE = /\{\{\s*([^{}]+?)\s*\}\}/g;
const REF = /^[A-Za-z][A-Za-z0-9_-]*(\.[A-Za-z0-9_-]+)?$/;

type Fn = (s: string, args: string[]) => string;

const FNS: Record<string, Fn> = {
  upper: (s) => s.toUpperCase(),
  lower: (s) => s.toLowerCase(),
  caesar: (s, [n]) => caesar(s, Number(n ?? 3)),
  rot13: (s) => rot13(s),
  atbash: (s) => atbash(s),
  vigenere: (s, [k]) => vigenere(s, k ?? "KEY"),
  b64: (s) => b64(s),
  hex: (s) => hex(s),
  base32: (s) => base32(s),
  reverse: (s) => reverse(s),
  morse: (s) => morse(s),
  a1z26: (s) => a1z26(s),
  rail: (s, [n]) => railfence(s, Number(n ?? 3)),
  spaced: (s) => [...s].join(" "),
  first: (s, [n]) => s.slice(0, Number(n ?? 1)),
  last: (s, [n]) => s.slice(-Number(n ?? 1)),
  nodash: (s) => s.replace(/-/g, ""),
  digits: (s) => s.replace(/\D/g, ""),
  letters: (s) => s.replace(/[^A-Za-z]/g, ""),
  pad: (s, [n, c]) => s.padStart(Number(n ?? 2), c ?? "0"),
  hhmm: (s) => {
    const m = /(\d{1,2}):(\d{2})/.exec(s);
    return m ? `${m[1]!.padStart(2, "0")}:${m[2]}` : s;
  },
  /** Shift an HH:MM time by N minutes (wraps at midnight). */
  addmin: (s, [n]) => shiftTime(s, Number(n ?? 0)),
};

export const TEMPLATE_FUNCTIONS = Object.keys(FNS);

export function shiftTime(hhmm: string, minutes: number): string {
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(hhmm.trim());
  if (!m) return hhmm;
  let total = Number(m[1]) * 60 + Number(m[2]) + minutes;
  total = ((total % 1440) + 1440) % 1440;
  const base = `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  return m[3] !== undefined ? `${base}:${m[3]}` : base;
}

function parseExpr(expr: string): { ref: string; fns: { name: string; args: string[] }[] } {
  const [head, ...pipes] = expr.split("|").map((p) => p.trim());
  if (!head || !REF.test(head)) throw new TemplateError(`invalid template reference "${head ?? ""}"`, head);
  const fns = pipes.map((p) => {
    const [name, ...args] = p.split(":").map((x) => x.trim());
    if (!name || !FNS[name]) throw new TemplateError(`unknown template function "${name ?? ""}"`);
    return { name, args };
  });
  return { ref: head, fns };
}

export function renderString(s: string, facts: Facts): string {
  if (!s.includes("{{")) return s;
  return s.replace(RE, (_, expr: string) => {
    const { ref, fns } = parseExpr(expr);
    if (!(ref in facts)) throw new TemplateError(`unknown fact "${ref}"`, ref);
    let v = facts[ref]!;
    for (const f of fns) {
      const args = f.args.map((a) => {
        if (!a.startsWith("@")) return a;
        const k = a.slice(1);
        if (!(k in facts)) throw new TemplateError(`unknown fact "${k}"`, k);
        return facts[k]!;
      });
      v = FNS[f.name]!(v, args);
    }
    return v;
  });
}

/** Deeply renders every string in a JSON-like value. */
export function render<T>(value: T, facts: Facts): T {
  if (typeof value === "string") return renderString(value, facts) as T;
  if (Array.isArray(value)) return value.map((v) => render(v, facts)) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = render(v, facts);
    return out as T;
  }
  return value;
}

/** All fact references used anywhere inside a JSON-like value. */
export function templateRefs(value: unknown, acc = new Set<string>()): Set<string> {
  if (typeof value === "string") {
    for (const m of value.matchAll(RE)) {
      try {
        const { ref, fns } = parseExpr(m[1]!);
        acc.add(ref);
        for (const f of fns) for (const a of f.args) if (a.startsWith("@")) acc.add(a.slice(1));
      } catch {
        /* invalid refs are reported by validateTemplates */
      }
    }
  } else if (Array.isArray(value)) value.forEach((v) => templateRefs(v, acc));
  else if (value && typeof value === "object") Object.values(value).forEach((v) => templateRefs(v, acc));
  return acc;
}

/** Syntax errors (unknown functions, malformed refs) — independent of fact values. */
export function templateErrors(value: unknown, path = "", out: { path: string; message: string }[] = []) {
  if (typeof value === "string") {
    for (const m of value.matchAll(RE)) {
      try {
        parseExpr(m[1]!);
      } catch (e) {
        out.push({ path, message: (e as Error).message });
      }
    }
  } else if (Array.isArray(value)) value.forEach((v, i) => templateErrors(v, `${path}[${i}]`, out));
  else if (value && typeof value === "object") Object.entries(value).forEach(([k, v]) => templateErrors(v, path ? `${path}.${k}` : k, out));
  return out;
}
