import { describe, expect, it } from "vitest";

import { fitRects, fitView, freeSpot, freeSpotRects, labelSpot, overlaps as countOverlaps, SLOT, tidy, type Rect } from "../../src/lib/experience/board-geometry";

const overlaps = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.abs(a.x - b.x) < SLOT.w && Math.abs(a.y - b.y) < SLOT.h;

describe("freeSpot", () => {
  it("uses the middle of the view when the wall is empty", () => {
    expect(freeSpot(500, 300, [])).toEqual({ x: 500 - 98, y: 300 - 56 });
  });

  it("never lands on top of an existing exhibit, however many are placed", () => {
    const placed: { x: number; y: number }[] = [];
    for (let i = 0; i < 40; i++) {
      const spot = freeSpot(600, 400, placed);
      expect(placed.some((p) => overlaps(p, spot))).toBe(false);
      placed.push(spot);
    }
  });

  it("stays close to the centre of attention", () => {
    const placed: { x: number; y: number }[] = [];
    for (let i = 0; i < 9; i++) placed.push(freeSpot(600, 400, placed));
    const far = Math.max(...placed.map((p) => Math.hypot(p.x + 98 - 600, p.y + 56 - 400)));
    expect(far).toBeLessThan(SLOT.w * 3);
  });

  it("is deterministic", () => {
    const seed = [{ x: 502, y: 344 }];
    expect(freeSpot(600, 400, seed)).toEqual(freeSpot(600, 400, seed));
  });
});

describe("fitView", () => {
  it("frames every exhibit inside the viewport", () => {
    const points = [
      { x: 40, y: 60 },
      { x: 940, y: 60 },
      { x: 40, y: 540 },
      { x: 940, y: 560 },
    ];
    const card = { w: 196, h: 118 };
    const view = { w: 1000, h: 640 };
    const f = fitView({ points, card, view, min: 0.3, max: 1.05 });
    for (const p of points) {
      expect(p.x * f.s + f.tx).toBeGreaterThanOrEqual(0);
      expect((p.x + card.w) * f.s + f.tx).toBeLessThanOrEqual(view.w);
      expect(p.y * f.s + f.ty).toBeGreaterThanOrEqual(0);
      expect((p.y + card.h) * f.s + f.ty).toBeLessThanOrEqual(view.h);
    }
  });

  it("does not blow a single exhibit up beyond the maximum scale", () => {
    const f = fitView({ points: [{ x: 10, y: 10 }], card: { w: 196, h: 118 }, view: { w: 1600, h: 900 }, min: 0.3, max: 1.05 });
    expect(f.s).toBe(1.05);
  });

  it("falls back to a sane view when there is nothing to frame", () => {
    expect(fitView({ points: [], card: { w: 1, h: 1 }, view: { w: 800, h: 600 }, min: 0.3, max: 1 })).toEqual({ s: 1, tx: 60, ty: 60 });
  });
});

describe("measured footprints", () => {
  const card = (id: string, x: number, y: number, h = 118, fixed = false) => ({ id, x, y, w: 196, h, fixed });

  it("drops a tall exhibit clear of everything already on the wall", () => {
    const taken: Rect[] = [card("a", 400, 300, 160), card("b", 640, 300, 96)];
    const spot = freeSpotRects(500, 360, taken, { w: 196, h: 150 });
    const mine = { x: spot.x, y: spot.y, w: 196, h: 150 };
    expect(countOverlaps([...taken, mine], 6)).toBe(0);
  });

  it("tidies an overlapping wall without moving what is fixed, and leaves a clear wall alone", () => {
    const messy = [card("fixed", 0, 0, 150, true), card("b", 60, 40), card("c", 120, 90), card("d", 900, 900)];
    const moves = tidy(messy);
    expect(moves.has("fixed")).toBe(false);
    expect(moves.has("d")).toBe(false);
    const after = messy.map((r) => ({ ...r, ...(moves.get(r.id) ?? {}) }));
    expect(countOverlaps(after, 6)).toBe(0);
    expect(tidy(after).size).toBe(0);
  });

  it("is deterministic", () => {
    const a = [card("x", 10, 10), card("y", 20, 15), card("z", 30, 20)];
    expect([...tidy(a)]).toEqual([...tidy(a)]);
  });

  it("puts a string's label where it covers no exhibit, nearest the middle", () => {
    const at = (t: number) => ({ x: t * 400, y: 0 });
    const blocker: Rect = { x: 170, y: -20, w: 60, h: 40 };
    const free = labelSpot(at, { w: 50, h: 16 }, []);
    expect(free.t).toBe(0.5);
    const moved = labelSpot(at, { w: 50, h: 16 }, [blocker]);
    expect(moved.t).not.toBe(0.5);
    const chip = { x: moved.p.x - 25, y: moved.p.y - 8, w: 50, h: 16 };
    expect(countOverlaps([chip, blocker], 0)).toBe(0);
  });

  it("frames rectangles inside the part of the wall that chrome leaves visible", () => {
    const rects: Rect[] = [card("a", 0, 0, 160), card("b", 800, 500)];
    const view = { w: 1000, h: 700 };
    const f = fitRects({ rects, view, min: 0.2, max: 1.05, pad: 40, inset: { top: 20, bottom: 80 } });
    for (const r of rects) {
      expect(r.y * f.s + f.ty).toBeGreaterThanOrEqual(20);
      expect((r.y + r.h) * f.s + f.ty).toBeLessThanOrEqual(view.h - 80);
    }
  });
});
