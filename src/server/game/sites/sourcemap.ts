/**
 * Minimal, correct Source Map v3 generation for our generated client bundles.
 * The "minifier" removes comments and indentation and joins statements onto one
 * line; every original line that survives gets a mapping segment, so DevTools
 * shows the original (commented) source from `sourcesContent`.
 */

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function vlq(n: number): string {
  let v = n < 0 ? (-n << 1) | 1 : n << 1;
  let out = "";
  do {
    let digit = v & 31;
    v >>>= 5;
    if (v > 0) digit |= 32;
    out += B64[digit];
  } while (v > 0);
  return out;
}

export function decodeVlq(s: string): number[] {
  const out: number[] = [];
  let shift = 0;
  let value = 0;
  for (const ch of s) {
    const d = B64.indexOf(ch);
    value += (d & 31) << shift;
    if (d & 32) shift += 5;
    else {
      out.push(value & 1 ? -(value >>> 1) : value >>> 1);
      value = 0;
      shift = 0;
    }
  }
  return out;
}

/** Strips `//` line comments that start a line and `/* … *\/` blocks on their own lines. Assumes our own well-formed source. */
export function minify(source: string, sourceName: string, outName: string): { code: string; map: string } {
  const lines = source.split("\n");
  const segments: string[] = [];
  let code = "";
  let prevGenCol = 0;
  let prevSrcLine = 0;
  let prevSrcCol = 0;
  let inBlock = false;
  lines.forEach((raw, i) => {
    const t = raw.trim();
    if (inBlock) {
      if (t.includes("*/")) inBlock = false;
      return;
    }
    if (t.startsWith("/*")) {
      if (!t.includes("*/")) inBlock = true;
      return;
    }
    if (!t || t.startsWith("//")) return;
    const srcCol = raw.length - raw.trimStart().length;
    const genCol = code.length;
    segments.push(vlq(genCol - prevGenCol) + vlq(0) + vlq(i - prevSrcLine) + vlq(srcCol - prevSrcCol));
    prevGenCol = genCol;
    prevSrcLine = i;
    prevSrcCol = srcCol;
    code += t;
  });
  const map = JSON.stringify({ version: 3, file: outName, sources: [sourceName], sourcesContent: [source], names: [], mappings: segments.join(",") });
  return { code: `${code}\n//# sourceMappingURL=${outName}.map\n`, map };
}
