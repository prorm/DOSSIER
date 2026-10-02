"use client";

/**
 * Typed faces for the index cards on the evidence wall.
 *
 * One canvas holds every card's face as a cell; the card shader samples it by
 * instance. Channels are masks, not colours, so the shader keeps lighting, the
 * state band and fog: red = typed ink, green = the archive stamp, blue = black
 * redaction bars on files the team may not read yet. Only what the model holds
 * is typed: a classified file has no title in the payload, so none is drawn.
 */

import * as THREE from "three";

import type { UNode } from "@/lib/experience/universe";

export interface CardFace {
  code: string;
  title: string | null;
  family: string;
  points: number | null;
  state: UNode["state"];
  scheduled: boolean;
}

export interface CardAtlas {
  texture: THREE.CanvasTexture;
  cols: number;
  rows: number;
  /** Redraw every face (titles revealed, states changed). Cheap: a few ms for a whole case. */
  draw: (faces: CardFace[]) => void;
  dispose: () => void;
}

const CELL_W = 256;
const CELL_H = 314;

/** The typewriter face the page already loaded for the theme, by its generated family name. */
function typeFamily(): string {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue("--font-courier").trim();
    if (v) return v;
  } catch {
    /* no DOM */
  }
  return "'Courier New', Courier, monospace";
}

function wrap(ctx: CanvasRenderingContext2D, text: string, width: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width <= width) line = next;
    else {
      if (line) lines.push(line);
      line = w;
      if (lines.length === maxLines) break;
    }
  }
  if (lines.length < maxLines && line) lines.push(line);
  if (lines.length === maxLines && words.join(" ") !== lines.join(" ")) {
    let last = lines[maxLines - 1]!;
    while (last.length > 1 && ctx.measureText(`${last}…`).width > width) last = last.slice(0, -1);
    lines[maxLines - 1] = `${last.replace(/[\s,;:–—-]+$/, "")}…`;
  }
  return lines;
}

export function createCardAtlas(count: number, quality: "low" | "full"): CardAtlas {
  const scale = quality === "low" ? 0.5 : 1;
  const cw = Math.round(CELL_W * scale);
  const ch = Math.round(CELL_H * scale);
  const cols = Math.max(1, Math.min(8, Math.ceil(Math.sqrt(count * 1.2))));
  const rows = Math.max(1, Math.ceil(count / cols));
  const canvas = document.createElement("canvas");
  canvas.width = cols * cw;
  canvas.height = rows * ch;
  const ctx = canvas.getContext("2d")!;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  texture.anisotropy = 4;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  let family = typeFamily();
  let last: CardFace[] = [];
  let disposed = false;

  const draw = (faces: CardFace[]) => {
    last = faces;
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = "lighter";
    const s = scale;
    faces.forEach((f, i) => {
      if (i >= cols * rows) return;
      const x0 = (i % cols) * cw;
      const y0 = Math.floor(i / cols) * ch;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x0, y0, cw, ch);
      ctx.clip();
      ctx.textBaseline = "alphabetic";
      // File code under the state band.
      ctx.fillStyle = "rgb(150,0,0)";
      ctx.font = `700 ${15 * s}px ${family}`;
      ctx.fillText(f.code, x0 + 22 * s, y0 + 62 * s);
      const tag = f.scheduled ? "SCHEDULED" : f.state === "available" ? "OPEN" : f.state === "discovered" ? "IN SIGHT" : f.state === "failed" ? "SEALED" : f.state === "completed" ? "CLOSED" : "";
      if (tag) {
        ctx.textAlign = "right";
        ctx.fillText(tag, x0 + cw - 22 * s, y0 + 62 * s);
        ctx.textAlign = "left";
      }
      // Rule under the header.
      ctx.fillStyle = "rgb(90,0,0)";
      ctx.fillRect(x0 + 22 * s, y0 + 72 * s, cw - 44 * s, 2 * s);
      if (f.title) {
        ctx.fillStyle = "rgb(255,0,0)";
        // As large as the title allows: short titles are typed big, long ones step down to fit four lines.
        const upper = f.title.toUpperCase();
        let size = 34;
        let lines = [] as string[];
        for (; size >= 23; size -= 2) {
          ctx.font = `700 ${size * s}px ${family}`;
          lines = wrap(ctx, upper, cw - 40 * s, 4);
          if (!lines.at(-1)?.endsWith("…")) break;
        }
        const lh = size * 1.14;
        lines.forEach((l, k) => ctx.fillText(l, x0 + 20 * s, y0 + (84 + size + k * lh) * s));
        // Typewriter ink sits heavy: a second pass a hair to the right.
        lines.forEach((l, k) => ctx.fillText(l, x0 + 20.8 * s, y0 + (84 + size + k * lh) * s));
      } else {
        // Classified: the title is not in the payload, so the card says exactly that.
        ctx.fillStyle = "rgb(0,0,255)";
        for (let k = 0; k < 3; k++) ctx.fillRect(x0 + 22 * s, y0 + (92 + k * 34) * s, (cw - 44 * s) * (k === 2 ? 0.55 : 1), 22 * s);
        ctx.fillStyle = "rgb(255,0,0)";
        ctx.font = `700 ${17 * s}px ${family}`;
        ctx.fillText("CLASSIFIED", x0 + 22 * s, y0 + 222 * s);
      }
      // Footer: what kind of file, what it is worth.
      ctx.fillStyle = "rgb(170,0,0)";
      ctx.font = `700 ${14 * s}px ${family}`;
      ctx.fillText(f.family.toUpperCase(), x0 + 22 * s, y0 + ch - 28 * s);
      if (f.points !== null) {
        ctx.textAlign = "right";
        ctx.fillText(`${f.points} PTS`, x0 + cw - 22 * s, y0 + ch - 28 * s);
        ctx.textAlign = "left";
      }
      if (f.state === "completed") {
        // The archive stamp: a ringed CLOSED, rotated like a hand did it.
        ctx.save();
        ctx.translate(x0 + cw * 0.66, y0 + ch * 0.74);
        ctx.rotate(-0.22);
        ctx.strokeStyle = "rgb(0,255,0)";
        ctx.lineWidth = 5 * s;
        ctx.strokeRect(-62 * s, -24 * s, 124 * s, 46 * s);
        ctx.fillStyle = "rgb(0,255,0)";
        ctx.font = `700 ${26 * s}px ${family}`;
        ctx.textAlign = "center";
        ctx.fillText("CLOSED", 0, 9 * s);
        ctx.restore();
      }
      ctx.restore();
    });
    texture.needsUpdate = true;
  };

  // The typewriter face may still be downloading: redraw once it is in.
  const fam = family;
  if (typeof document !== "undefined" && document.fonts?.load) {
    void document.fonts
      .load(`700 27px ${fam}`)
      .then(() => {
        if (disposed) return;
        family = typeFamily();
        if (last.length) draw(last);
      })
      .catch(() => undefined);
  }

  return {
    texture,
    cols,
    rows,
    draw,
    dispose: () => {
      disposed = true;
      texture.dispose();
    },
  };
}

/** World height of an act strip on the wall; the scene sizes its plane with this. */
export const STRIP_H = 1.62;

/** A header strip over an act's column on the wall: act number and progress over the act's typed name, on manila. */
export function createActStrip(text: string, sub: string, widthUnits: number): THREE.CanvasTexture {
  const H = 150;
  const W = Math.max(256, Math.min(2048, Math.round((widthUnits / STRIP_H) * H)));
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const x = c.getContext("2d")!;
  const fam = typeFamily();
  const paint = () => {
    x.textAlign = "left";
    x.textBaseline = "alphabetic";
    x.fillStyle = "#e9d9a6";
    x.fillRect(0, 0, W, H);
    // Fibres and a darker fold line: it should read as card stock, not a UI chip.
    for (let i = 0; i < 320; i++) {
      x.fillStyle = `rgba(120,90,40,${0.04 + ((i * 37) % 11) / 160})`;
      x.fillRect((i * 97) % W, (i * 53) % H, 1 + (i % 3), 1);
    }
    x.fillStyle = "rgba(90,60,20,0.18)";
    x.fillRect(0, H - 10, W, 10);
    x.fillStyle = "#8a1d1d";
    x.font = `700 30px ${fam}`;
    x.fillText(sub, 22, 46);
    x.fillStyle = "rgba(35,28,16,0.55)";
    x.fillRect(22, 60, W - 44, 3);
    x.fillStyle = "#231c10";
    const full = text.toUpperCase();
    for (let size = 50; size >= 28; size -= 2) {
      x.font = `700 ${size}px ${fam}`;
      if (x.measureText(full).width <= W - 44) break;
    }
    let t = full;
    if (x.measureText(full).width > W - 44) while (t.length > 3 && x.measureText(`${t}…`).width > W - 44) t = t.slice(0, -1);
    const line = t === full ? t : `${t.trimEnd()}…`;
    x.fillText(line, 22, 112);
    x.fillText(line, 23, 112);
  };
  paint();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  if (document.fonts?.load) {
    void document.fonts
      .load(`700 40px ${fam}`)
      .then(() => {
        paint();
        tex.needsUpdate = true;
      })
      .catch(() => undefined);
  }
  return tex;
}
