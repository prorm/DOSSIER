/**
 * Pure geometry for the evidence wall — kept out of the component so it can be tested
 * and so "where does a new exhibit land?" has one answer.
 *
 * Everything works on real rectangles: an exhibit's footprint is what the DOM
 * measured for it (a polaroid is taller than a sticky note), with a fallback
 * size for anything not yet on screen.
 */

export interface Box {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Footprint used for collision when dropping an exhibit: card size plus breathing room for strings. */
export const SLOT = { w: 224, h: 152 } as const;

/** Room left around every exhibit so strings and their labels have somewhere to run. */
export const GUTTER = 28;

const hits = (a: Rect, b: Rect, gap: number) => a.x < b.x + b.w + gap && a.x + a.w + gap > b.x && a.y < b.y + b.h + gap && a.y + a.h + gap > b.y;

/**
 * The nearest free slot to `(cx, cy)` — the middle of what the player is looking at.
 * Exhibits fan out from there in rings instead of stacking, so pinning ten things in a row
 * reads as "the wall filled up", not "a heap".
 */
export function freeSpot(cx: number, cy: number, taken: readonly Box[], size: { w: number; h: number } = SLOT, card = { w: 196, h: 112 }): Box {
  return freeSpotRects(
    cx,
    cy,
    taken.map((t) => ({ x: t.x, y: t.y, w: card.w, h: card.h })),
    { w: card.w, h: card.h },
    { w: size.w - card.w, h: size.h - card.h },
  );
}

/** Same, against measured rectangles: the new card's own size, never closer than `gap` to anything. */
export function freeSpotRects(cx: number, cy: number, taken: readonly Rect[], card: { w: number; h: number }, gap: { w: number; h: number } = { w: GUTTER, h: GUTTER + 12 }): Box {
  const x0 = cx - card.w / 2;
  const y0 = cy - card.h / 2;
  const stepX = card.w + gap.w;
  const stepY = card.h + gap.h;
  const clash = (x: number, y: number) => taken.some((t) => x < t.x + t.w + gap.w && x + card.w + gap.w > t.x && y < t.y + t.h + gap.h && y + card.h + gap.h > t.y);
  if (!clash(x0, y0)) return { x: Math.round(x0), y: Math.round(y0) };
  for (let ring = 1; ring < 40; ring++) {
    const cells: [number, number][] = [];
    for (let i = -ring; i <= ring; i++) {
      cells.push([i, -ring], [i, ring]);
      if (Math.abs(i) !== ring) cells.push([-ring, i], [ring, i]);
    }
    // Wider than tall, and nearest first, so the cluster grows into a landscape wall.
    cells.sort((a, b) => Math.hypot(a[0] * stepX, a[1] * stepY * 1.15) - Math.hypot(b[0] * stepX, b[1] * stepY * 1.15));
    for (const [gx, gy] of cells) {
      const x = x0 + gx * stepX;
      const y = y0 + gy * stepY;
      if (!clash(x, y)) return { x: Math.round(x), y: Math.round(y) };
    }
  }
  return { x: Math.round(x0), y: Math.round(y0) };
}

export interface FitInput {
  points: readonly Box[];
  card: { w: number; h: number };
  view: { w: number; h: number };
  min: number;
  max: number;
  pad?: number;
}

/** Scale and translation that frame every point in the viewport (centred, padded). */
export function fitView({ points, card, view, min, max, pad = 120 }: FitInput): { s: number; tx: number; ty: number } {
  return fitRects({ rects: points.map((p) => ({ x: p.x, y: p.y, w: card.w, h: card.h })), view, min, max, pad });
}

/** Frame every rectangle; `inset` keeps the frame clear of chrome laid over the wall (a bar at the bottom, say). */
export function fitRects({ rects, view, min, max, pad = 120, inset = { top: 0, bottom: 0 } }: { rects: readonly Rect[]; view: { w: number; h: number }; min: number; max: number; pad?: number; inset?: { top: number; bottom: number } }): { s: number; tx: number; ty: number } {
  if (!rects.length || view.w <= 0 || view.h <= 0) return { s: 1, tx: 60, ty: 60 };
  const minX = Math.min(...rects.map((r) => r.x));
  const minY = Math.min(...rects.map((r) => r.y));
  const maxX = Math.max(...rects.map((r) => r.x + r.w));
  const maxY = Math.max(...rects.map((r) => r.y + r.h));
  const vh = Math.max(1, view.h - inset.top - inset.bottom);
  const s = Math.min(max, Math.max(min, Math.min(view.w / (maxX - minX + pad), vh / (maxY - minY + pad))));
  return { s, tx: (view.w - (maxX - minX) * s) / 2 - minX * s, ty: inset.top + (vh - (maxY - minY) * s) / 2 - minY * s };
}

/** How many pairs of exhibits overlap (or sit closer than `gap`). */
export function overlaps(rects: readonly Rect[], gap = 6): number {
  let n = 0;
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) if (hits(rects[i]!, rects[j]!, gap)) n++;
  return n;
}

/**
 * Straighten the wall: push apart anything that overlaps, the least distance
 * that separates it, leaving everything else where the team put it. Fixed
 * (pinned) exhibits never move; the others give way around them. Deterministic.
 */
export function tidy(items: readonly (Rect & { id: string; fixed?: boolean })[], gap = GUTTER): Map<string, Box> {
  const r = items.map((i) => ({ ...i }));
  for (let pass = 0; pass < 80; pass++) {
    let moved = false;
    for (let i = 0; i < r.length; i++)
      for (let j = i + 1; j < r.length; j++) {
        const a = r[i]!;
        const b = r[j]!;
        if (!hits(a, b, gap - 1)) continue;
        if (a.fixed && b.fixed) continue;
        // Overlap on each axis including the gap; separate along the cheaper one.
        const ox = Math.min(a.x + a.w + gap - b.x, b.x + b.w + gap - a.x);
        const oy = Math.min(a.y + a.h + gap - b.y, b.y + b.h + gap - a.y);
        const acx = a.x + a.w / 2;
        const bcx = b.x + b.w / 2;
        const acy = a.y + a.h / 2;
        const bcy = b.y + b.h / 2;
        const share = a.fixed ? [0, 1] : b.fixed ? [1, 0] : [0.5, 0.5];
        if (ox <= oy * 1.25) {
          const dir = bcx > acx || (bcx === acx && a.id < b.id) ? 1 : -1;
          a.x -= dir * ox * share[0]!;
          b.x += dir * ox * share[1]!;
        } else {
          const dir = bcy > acy || (bcy === acy && a.id < b.id) ? 1 : -1;
          a.y -= dir * oy * share[0]!;
          b.y += dir * oy * share[1]!;
        }
        moved = true;
      }
    if (!moved) break;
  }
  const out = new Map<string, Box>();
  r.forEach((x, k) => {
    const o = items[k]!;
    const nx = Math.round(x.x);
    const ny = Math.round(x.y);
    if (nx !== Math.round(o.x) || ny !== Math.round(o.y)) out.set(o.id, { x: nx, y: ny });
  });
  return out;
}

/**
 * Where along a hanging string its label should sit: the point nearest the middle
 * whose chip covers no exhibit. Falls back to the middle when the wall is that crowded.
 */
export function labelSpot(at: (t: number) => Box, chip: { w: number; h: number }, obstacles: readonly Rect[]): { t: number; p: Box } {
  for (const t of [0.5, 0.42, 0.58, 0.34, 0.66, 0.27, 0.73, 0.2, 0.8]) {
    const p = at(t);
    const box = { x: p.x - chip.w / 2, y: p.y - chip.h / 2, w: chip.w, h: chip.h };
    if (!obstacles.some((o) => hits(box, o, 2))) return { t, p };
  }
  return { t: 0.5, p: at(0.5) };
}
