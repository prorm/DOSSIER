"use client";

import { ArrowRight, Box, Crosshair, Layers, Lock, Map as MapIcon, Volume2, VolumeX, X } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Component, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ErrorInfo, type ReactNode } from "react";

import { useMotion } from "@/components/experience/motion";
import { playCue, setSoundEnabled, useSoundEnabled } from "@/components/experience/sound";
import { useTheme } from "@/components/experience/theme-provider";
import { useIsClient } from "@/components/dossier/effects";
import { FAMILY_LABEL, nodeHref } from "@/lib/modes";
import { withAccent, type ThemeDef } from "@/lib/experience/themes";
import { buildUniverse, readingOrder, type UNode, type UniverseInput, type UniverseModel, type UState, type Vec3 } from "@/lib/experience/universe";
import { teamDressing, type TeamDressing } from "@/lib/experience/variation";
import { cn } from "@/lib/utils";
import { UniverseFlat } from "./universe-flat";
import type { LabelSink, Posture, SceneMode, TeamPin } from "./universe-scene";

const UniverseScene = dynamic(() => import("./universe-scene"), { ssr: false });

/* ─────────────────────────── context ─────────────────────────── */

export interface UniverseCtx {
  model: UniverseModel;
  theme: ThemeDef;
  dress: TeamDressing;
  mode: SceneMode;
  posture: Posture;
  selectedId: string | null;
  hoveredId: string | null;
  select: (id: string | null) => void;
  hover: (id: string | null) => void;
  flyTo: (target: Vec3, distance?: number) => void;
  recenter: () => void;
  renderer: "3d" | "2d";
  setRenderer: (r: "3d" | "2d") => void;
  can3d: boolean;
  fly: { target: Vec3; distance?: number; key: number } | null;
  pulses: { id: string; key: number }[];
  pulse: (id: string) => void;
  /** An opening sequence is playing on top: render one frame, animate nothing yet. */
  held: boolean;
  holdIntro: (held: boolean) => void;
}

const Ctx = createContext<UniverseCtx | null>(null);

export function useUniverse(): UniverseCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useUniverse must be used inside <UniverseProvider>");
  return c;
}
export function useMaybeUniverse(): UniverseCtx | null {
  return useContext(Ctx);
}

const RENDERER_KEY = "dossier.universe.renderer";

export function UniverseProvider({
  input,
  fingerprint,
  layoutSeed,
  mode = "player",
  posture = "focus",
  accent,
  children,
}: {
  input: UniverseInput;
  fingerprint: string;
  layoutSeed?: string;
  mode?: SceneMode;
  posture?: Posture;
  /** The organiser's accent colour name; themes built around signal colours follow it. */
  accent?: string;
  children: ReactNode;
}) {
  const base = useTheme();
  const theme = useMemo(() => withAccent(base, accent), [base, accent]);
  const motion = useMotion();
  const dress = useMemo(() => teamDressing(fingerprint), [fingerprint]);
  const model = useMemo(() => buildUniverse(input, { layout: theme.universe.layout, rotation: dress.rotation, seed: layoutSeed ?? "dossier" }), [input, theme, dress.rotation, layoutSeed]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [pref, setPref] = useState<"auto" | "3d" | "2d">("auto");
  const [fly, setFly] = useState<UniverseCtx["fly"]>(null);
  const [pulses, setPulses] = useState<{ id: string; key: number }[]>([]);
  const [held, setHeld] = useState(false);
  const flyKey = useRef(0);
  const prev = useRef<Map<string, UState>>(new Map());

  useEffect(() => {
    try {
      const v = window.localStorage.getItem(RENDERER_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot, hydration-safe read of localStorage (an external store)
      if (v === "3d" || v === "2d") setPref(v);
    } catch {
      /* private mode */
    }
  }, []);

  const can3d = motion.webgl;
  const renderer: "3d" | "2d" = pref === "2d" ? "2d" : pref === "3d" ? (can3d ? "3d" : "2d") : motion.effects && can3d && !motion.lean ? "3d" : "2d";
  const setRenderer = useCallback((r: "3d" | "2d") => {
    setPref(r);
    try {
      window.localStorage.setItem(RENDERER_KEY, r);
    } catch {
      /* ignore */
    }
  }, []);

  const doFly = useCallback((target: Vec3, distance?: number) => setFly({ target, distance, key: ++flyKey.current }), []);
  const recenter = useCallback(() => {
    setSelectedId(null);
    setFly({ target: model.focus, distance: undefined, key: ++flyKey.current });
  }, [model.focus]);

  // The world answering real changes: cues for unlocks and solves, and the camera drifts to what just opened.
  useEffect(() => {
    if (prev.current.size) {
      const opened: UNode[] = [];
      for (const n of model.nodes) {
        const b = prev.current.get(n.id);
        if (b && b !== n.state) {
          if (n.state === "completed") playCue("solve", theme.sound);
          if (n.state === "available" || (b === "locked" && n.state === "discovered")) opened.push(n);
        }
      }
      if (opened.length) {
        playCue("unlock", theme.sound);
        const c = opened.reduce((s, n) => [s[0] + n.pos[0], s[1] + n.pos[1], s[2] + n.pos[2]] as Vec3, [0, 0, 0] as Vec3);
        if (posture === "focus" && mode === "player") setFly({ target: [c[0] / opened.length, c[1] / opened.length, c[2] / opened.length], key: ++flyKey.current });
      }
    }
    prev.current = new Map(model.nodes.map((n) => [n.id, n.state]));
  }, [model, theme, posture, mode]);

  const select = useCallback(
    (id: string | null) => {
      setSelectedId(id);
      if (id) playCue("tick", theme.sound);
    },
    [theme],
  );
  const pulse = useCallback((id: string) => setPulses((p) => [...p.filter((x) => x.id !== id), { id, key: Date.now() }].slice(-40)), []);

  const value = useMemo<UniverseCtx>(
    () => ({ model, theme, dress, mode, posture, selectedId, hoveredId, select, hover: setHoveredId, flyTo: doFly, recenter, renderer, setRenderer, can3d, fly, pulses, pulse, held, holdIntro: setHeld }),
    [model, theme, dress, mode, posture, selectedId, hoveredId, select, doFly, recenter, renderer, setRenderer, can3d, fly, pulses, pulse, held],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/* ─────────────────────────── error boundary ─────────────────────────── */

class SceneBoundary extends Component<{ onFail: () => void; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch(err: Error, info: ErrorInfo) {
    console.warn("[dossier] 3D scene failed, falling back to 2D:", err.message, info.componentStack?.split("\n")[1]);
    this.props.onFail();
  }
  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

/* ─────────────────────────── the rendering layer ─────────────────────────── */

/**
 * The universe as a full-bleed layer. Server HTML is a calm themed void; on
 * capable devices the WebGL scene fades in over the flat SVG, which stays
 * mounted underneath as the accessible, always-correct rendering.
 */
export function UniverseBackdrop({
  className,
  hud = true,
  legend = true,
  labels = true,
  pins,
  path,
  reveal,
  revealRef,
  intro = true,
  inspector,
  fixed = false,
  shift,
  list = true,
  interactive = true,
  acts = true,
  maxLabels,
  tagIds,
  tagMeta,
  labelClearLeft = 0,
}: {
  className?: string;
  hud?: boolean;
  /** The player-facing state legend (Open / In sight / Archived…). Author and ops views bring their own. */
  legend?: boolean;
  labels?: boolean;
  pins?: TeamPin[];
  path?: string[];
  reveal?: number;
  revealRef?: React.MutableRefObject<number>;
  intro?: boolean;
  inspector?: (n: UNode) => ReactNode;
  fixed?: boolean;
  /** Pixels to push the picture's centre right (overrides the default clearance for a side panel). */
  shift?: number;
  /** The sr-only file list. Scenery turns it off. */
  list?: boolean;
  /** Pure scenery: no pointer, no keyboard, nothing to tab to. */
  interactive?: boolean;
  /** Act names in space (overview). Miniatures turn them off. */
  acts?: boolean;
  /** At most this many open files carry a tag (default 6 for players, 10 otherwise). */
  maxLabels?: number;
  /** Exactly these files carry tags (plus whatever is selected or hovered), instead of the open ones. */
  tagIds?: string[];
  /** A line under a tag's title (the Control Room's live numbers). */
  tagMeta?: (n: UNode) => string | null;
  /** Tags never start left of this x (px): a panel lies over that strip. */
  labelClearLeft?: number;
}) {
  const u = useUniverse();
  const motion = useMotion();
  const client = useIsClient();
  const holder = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const [onscreen, setOnscreen] = useState(true);
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1100px)");
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  useEffect(() => {
    const el = holder.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setOnscreen(Boolean(e?.isIntersecting)), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const use3d = client && u.renderer === "3d" && !failed;
  const order = useMemo(() => readingOrder(u.model), [u.model]);
  const sink = useRef<LabelSink["current"]>(new Map());
  const actSink = useRef<LabelSink["current"]>(new Map());
  // Index cards carry their own typed titles: on the wall only the card under the pointer gets a tag.
  const cards = u.model.layout === "wall";
  const labelIds = useMemo(() => {
    const ids = new Set<string>();
    if (u.selectedId) ids.add(u.selectedId);
    if (u.hoveredId) ids.add(u.hoveredId);
    if (tagIds) tagIds.forEach((id) => ids.add(id));
    else if (labels && !cards) u.model.nodes.filter((n) => n.state === "available").slice(0, maxLabels ?? (u.mode === "player" ? 6 : 10)).forEach((n) => ids.add(n.id));
    return [...ids];
  }, [u.model, u.selectedId, u.hoveredId, u.mode, labels, cards, maxLabels, tagIds]);
  // Acts are named where they sit in space whenever the whole case is in view (the wall pins its own strips).
  const showActs = acts && use3d && !cards && u.model.acts.length > 1 && (u.posture === "overview" || u.mode !== "player");
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") return u.select(null);
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft" && e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const t = e.target as HTMLElement;
    if (t.closest("a,button,input,textarea,select") && t !== e.currentTarget) return;
    e.preventDefault();
    const i = order.findIndex((n) => n.id === u.selectedId);
    const d = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1;
    u.select(order[(i + d + order.length) % order.length]?.id ?? null);
  };

  return (
    <div
      ref={holder}
      className={cn("u-layer", fixed && "u-layer-fixed", className)}
      data-renderer={use3d ? "3d" : "2d"}
      data-ready={ready ? "true" : "false"}
      data-posture={u.posture}
      data-testid="case-universe"
      role={interactive ? "application" : "presentation"}
      aria-roledescription={interactive ? "case universe" : undefined}
      aria-hidden={interactive ? undefined : true}
      aria-label={`Investigation map: ${u.model.counts.available} files open, ${u.model.counts.completed} completed, ${u.model.counts.locked + u.model.counts.discovered} still hidden. Use arrow keys to move between files, Enter to open.`}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={interactive ? onKey : undefined}
      style={interactive ? undefined : { pointerEvents: "none" }}
    >
      {/* Calm themed void: what the server renders and what shows while WebGL boots. */}
      <div className="u-void" aria-hidden="true" />
      {client ? (
        <div className={cn("u-flat-wrap", use3d && ready && "is-under")}>
          <UniverseFlat model={u.model} theme={u.theme} selectedId={u.selectedId} hoveredId={u.hoveredId} onSelect={u.select} onHover={u.hover} dress={u.dress} labels={labels} interactive={!use3d || !ready} posture={u.posture} />
        </div>
      ) : null}
      {use3d ? (
        <div className={cn("u-gl", ready && "is-ready")}>
          <SceneBoundary onFail={() => setFailed(true)}>
            <UniverseScene
              model={u.model}
              theme={u.theme}
              mode={u.mode}
              posture={u.posture}
              selectedId={u.selectedId}
              hoveredId={u.hoveredId}
              onSelect={u.select}
              onHover={u.hover}
              tier={motion.tier}
              labelIds={labelIds}
              labelSink={sink as LabelSink}
              actSink={showActs ? (actSink as LabelSink) : undefined}
              fingerprint={u.dress.id}
              pins={pins}
              pulses={u.pulses}
              path={path}
              reveal={reveal}
              revealRef={revealRef}
              paused={!motion.visible || !onscreen}
              hold={u.held}
              viewShift={shift ?? (fixed && wide ? (u.posture === "focus" ? 64 : -150) : 0)}
              intro={intro}
              fly={u.fly}
              onFail={() => setFailed(true)}
              onReady={() => setReady(true)}
            />
          </SceneBoundary>
        </div>
      ) : null}

      {use3d && ready && showActs ? <ActTags3D sink={actSink} model={u.model} align={u.theme.id === "blacksite" ? "left" : "center"} /> : null}
      {use3d && ready ? <Tags3D ids={labelIds} sink={sink} avoid={showActs ? actSink : undefined} clearLeft={labelClearLeft} model={u.model} dress={u.dress} activeId={u.selectedId ?? u.hoveredId} meta={tagMeta} /> : null}

      {/* Real links for assistive tech and no-JS-graphics fallbacks: the graph as a list. */}
      <ul className="sr-only" aria-label="Files in the investigation" hidden={!list}>
        {order.map((n) => (
          <li key={n.id}>
            {n.state === "available" || n.state === "completed" || n.state === "failed" ? <Link href={nodeHref(n.id)}>{n.label}</Link> : <span>{n.label}</span>}
          </li>
        ))}
      </ul>

      {hud ? <UniverseHud inspector={inspector} legend={legend} /> : null}
    </div>
  );
}

/** DOM tags that ride on top of the WebGL canvas, positioned each frame from the scene's projections. */
/** Where the act names sat last frame (per scene), so file callouts can steer clear of them. */
type Rect = { l: number; t: number; w: number; h: number };
const ACT_RECTS = new WeakMap<object, Rect[]>();

function Tags3D({ ids, sink, avoid, clearLeft = 0, model, dress, activeId, meta }: { ids: string[]; sink: React.RefObject<LabelSink["current"]>; avoid?: object; clearLeft?: number; model: UniverseModel; dress: TeamDressing; activeId: string | null; meta?: (n: UNode) => string | null }) {
  const els = useRef(new Map<string, HTMLDivElement>());
  const activeRef = useRef<string | null>(activeId);
  useEffect(() => {
    activeRef.current = activeId;
  }, [activeId]);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      // Greedy de-overlap: tags are placed nearest-first; a tag that would collide with one already placed is lifted above it.
      const placed: { x: number; y: number; w: number; h: number }[] = [];
      const items = [...els.current.entries()]
        .map(([id, el]) => ({ id, el, p: sink.current?.get(id) }))
        .sort((a, b) => (b.p?.y ?? 0) - (a.p?.y ?? 0));
      for (const { id, el, p } of items) {
        if (!p || !p.on) {
          el.style.opacity = "0";
          continue;
        }
        const w = el.offsetWidth || 120;
        const h = el.offsetHeight || 30;
        const x = clearLeft > 0 ? Math.max(p.x, clearLeft + w / 2) : p.x;
        let y = p.y;
        const pinned = id === activeRef.current;
        for (let k = 0; k < 4 && !pinned; k++) {
          const hit = placed.find((r) => Math.abs(r.x - x) < (r.w + w) / 2 && Math.abs(r.y - y) < (r.h + h) / 2 + 2);
          if (!hit) break;
          y = hit.y - hit.h - 4;
        }
        // An act name is structure the operator reads the room by: a callout never sits on one. It steps just
        // above or just below the label, whichever is the shorter move (the tag is anchored at its bottom edge).
        const acts = (avoid && ACT_RECTS.get(avoid)) || [];
        for (let k = 0; k < 4; k++) {
          const a = acts.find((r) => x - w / 2 < r.l + r.w + 4 && x + w / 2 > r.l - 4 && y - h < r.t + r.h + 3 && y > r.t - 3);
          if (!a) break;
          const up = a.t - 4;
          const down = a.t + a.h + 4 + h;
          y = Math.abs(up - y) <= Math.abs(down - y) ? up : down;
        }
        placed.push({ x, y, w, h });
        el.style.opacity = "1";
        el.style.zIndex = pinned ? "3" : "1";
        el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -100%)`;
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [sink, avoid, clearLeft]);
  return (
    <div className="u-tags" aria-hidden="true">
      {ids.map((id) => {
        const n = model.nodes[model.byId.get(id) ?? -1];
        if (!n) return null;
        const active = id === activeId;
        return (
          <div key={id} ref={(el) => void (el ? els.current.set(id, el) : els.current.delete(id))} className={cn("u-tag", active && "is-active", `is-${n.state}`, n.isNew && "is-new", n.suspicious && "is-suspicious")} style={{ opacity: 0 }}>
            <span className="u-tag-code">{dress.fileCode(n.id)}</span>
            <span className="u-tag-title">{n.title ?? "Classified file"}</span>
            {meta ? (
              meta(n) ? <span className="u-tag-meta">{meta(n)}</span> : null
            ) : active && n.state !== "locked" ? (
              <span className="u-tag-meta">
                {n.points} pts · ~{n.minutes} min
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/** Act names riding on the scene: a layer's corner, a constellation's crown, a channel marker. */
function ActTags3D({ sink, model, align }: { sink: React.RefObject<LabelSink["current"]>; model: UniverseModel; align: "left" | "center" }) {
  const els = useRef(new Map<string, HTMLDivElement>());
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      // Greedy de-overlap, lowest on screen first: a label that would sit on another climbs above it.
      const placed: { l: number; t: number; w: number; h: number }[] = [];
      const items = [...els.current.entries()].map(([id, el]) => ({ el, p: sink.current?.get(id) })).sort((a, b) => (b.p?.y ?? 0) - (a.p?.y ?? 0));
      for (const { el, p } of items) {
        if (!p || !p.on) {
          el.style.opacity = "0";
          continue;
        }
        const w = el.offsetWidth || 120;
        const h = el.offsetHeight || 18;
        // Names stay inside the frame (a phone is narrower than a label's run); they slide, never clip.
        const W = el.parentElement?.clientWidth ?? Infinity;
        const l = Math.max(4, Math.min(W - w - 4, align === "left" ? p.x : p.x - w / 2));
        const x = align === "left" ? l : l + w / 2;
        let t = p.y - h;
        for (let k = 0; k < 5; k++) {
          const hit = placed.find((r) => l < r.l + r.w + 6 && l + w + 6 > r.l && t < r.t + r.h + 3 && t + h + 3 > r.t);
          if (!hit) break;
          t = hit.t - h - 4;
        }
        placed.push({ l, t, w, h });
        el.style.opacity = "";
        el.style.transform = `translate3d(${x.toFixed(1)}px, ${(t + h).toFixed(1)}px, 0)`;
      }
      ACT_RECTS.set(sink, placed);
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [sink, align]);
  return (
    <div className="u-acttags" aria-hidden="true">
      {model.acts
        .filter((a) => a.count > 0)
        .map((a) => (
          <div key={a.id} ref={(el) => void (el ? els.current.set(a.id, el) : els.current.delete(a.id))} className={cn("u-acttag", !a.started && "is-sealed", a.complete && "is-done")} style={{ opacity: 0 }}>
            <span className="u-acttag-no num">{String(a.index + 1).padStart(2, "0")}</span>
            {/* A sealed act is a redaction, not the same word seven times over. */}
            {a.started && a.title ? <span className="u-acttag-name">{a.title}</span> : <span className="u-acttag-name is-redacted" />}
            <span className="u-acttag-count num">
              {a.done}/{a.count}
            </span>
          </div>
        ))}
    </div>
  );
}

/* ─────────────────────────── HUD ─────────────────────────── */

const STATE_LABEL: Record<UState, string> = { locked: "Hidden", discovered: "In sight", available: "Open", completed: "Archived", failed: "Sealed" };

export function UniverseHud({ inspector, legend = true }: { inspector?: (n: UNode) => ReactNode; legend?: boolean }) {
  const u = useUniverse();
  const sound = useSoundEnabled();
  const c = u.model.counts;
  const sel = u.selectedId ? u.model.nodes[u.model.byId.get(u.selectedId) ?? -1] : undefined;
  const acts = u.model.acts;
  const currentAct = acts.filter((a) => a.started).at(-1)?.index ?? 0;
  return (
    <>
      <div className="u-controls" role="toolbar" aria-label="Map controls">
        {u.can3d ? (
          <div className="u-seg" role="group" aria-label="Rendering">
            <button type="button" aria-pressed={u.renderer === "3d"} onClick={() => u.setRenderer("3d")} title="Spatial view">
              <Box className="size-3.5" aria-hidden="true" /> <span>3D</span>
            </button>
            <button type="button" aria-pressed={u.renderer === "2d"} onClick={() => u.setRenderer("2d")} title="Flat view">
              <MapIcon className="size-3.5" aria-hidden="true" /> <span>2D</span>
            </button>
          </div>
        ) : null}
        <button type="button" className="u-btn" onClick={u.recenter} title="Recentre on the frontier" aria-label="Recentre on the frontier">
          <Crosshair className="size-3.5" aria-hidden="true" />
        </button>
        <button
          type="button"
          className="u-btn"
          aria-pressed={sound}
          onClick={() => {
            setSoundEnabled(!sound);
            if (!sound) setTimeout(() => playCue("confirm", u.theme.sound), 60);
          }}
          title={sound ? "Sound on" : "Sound off"}
          aria-label={sound ? "Turn sound off" : "Turn sound on"}
        >
          {sound ? <Volume2 className="size-3.5" aria-hidden="true" /> : <VolumeX className="size-3.5" aria-hidden="true" />}
        </button>
      </div>

      <div className={cn("u-legend", !legend && "is-off")} aria-label="Legend">
        {(["available", "discovered", "completed", "locked"] as const).map((s) => (
          <span key={s} className={cn("u-legend-item", `is-${s}`)}>
            <i aria-hidden="true" />
            {STATE_LABEL[s]} <b className="num">{c[s]}</b>
          </span>
        ))}
        {c.suspicious ? (
          <span className="u-legend-item is-suspicious">
            <i aria-hidden="true" />
            Anomalies <b className="num">{c.suspicious}</b>
          </span>
        ) : null}
      </div>

      {acts.length > 1 ? (
        <nav className="u-acts" aria-label="Acts">
          <Layers className="size-3.5 text-faint" aria-hidden="true" />
          {acts.map((a) => {
            const ns = u.model.nodes.filter((n) => n.actIndex === a.index);
            const focus = ns.find((n) => n.state === "available") ?? ns[0];
            return (
              <button
                key={a.id}
                type="button"
                disabled={!a.started}
                aria-current={a.index === currentAct ? "true" : undefined}
                className={cn("u-act", a.complete && "is-done", a.index === currentAct && "is-current")}
                onClick={() => focus && u.flyTo(focus.pos, u.theme.universe.distance * 0.55)}
                title={a.started ? `${a.title} — ${a.done}/${a.count} archived` : "Classified"}
              >
                <span className="num">{String(a.index + 1).padStart(2, "0")}</span>
                <em>{a.started ? a.title : "▒▒▒"}</em>
                <s aria-hidden="true" style={{ width: `${a.count ? (a.done / a.count) * 100 : 0}%` }} />
              </button>
            );
          })}
        </nav>
      ) : null}

      {sel ? (
        <aside className="u-inspector panel" aria-live="polite" aria-label="Selected file">
          <button type="button" className="u-close" onClick={() => u.select(null)} aria-label="Close">
            <X className="size-3.5" aria-hidden="true" />
          </button>
          {inspector ? inspector(sel) : <PlayerInspector n={sel} />}
        </aside>
      ) : null}
    </>
  );
}

function PlayerInspector({ n }: { n: UNode }) {
  const u = useUniverse();
  const openable = n.availability === "open" || n.availability === "solved" || n.availability === "failed";
  return (
    <div className="space-y-2.5">
      <p className="label-mono flex flex-wrap items-center gap-x-2">
        <span>{FAMILY_LABEL[n.family] ?? n.family}</span>
        <span className="text-faint">·</span>
        <span className={cn("u-state", `is-${n.state}`)}>{n.scheduled ? "Scheduled" : STATE_LABEL[n.state]}</span>
        <span className="text-faint">·</span>
        <span className="text-faint">{u.dress.fileCode(n.id)}</span>
      </p>
      <h3 className="text-lg leading-tight font-semibold">{n.title ?? "Classified file"}</h3>
      {n.state !== "locked" ? (
        <p className="font-mono text-xs text-mute">
          {n.points} pts · ~{n.minutes} min{n.optional ? " · side path" : ""}
          {n.signals.wrong ? ` · ${n.signals.wrong} misses` : ""}
        </p>
      ) : null}
      {n.suspicious ? <p className="font-mono text-[0.7rem] text-signal-amber">Anomaly: this file is not behaving like the others.</p> : null}
      {!openable ? (
        <div>
          {n.opensAt ? (
            <p className="font-mono text-xs text-signal-amber">Opens {new Date(n.opensAt).toLocaleString([], { hour: "2-digit", minute: "2-digit", month: "short", day: "numeric" })}</p>
          ) : n.requirements.length ? (
            <ul className="space-y-1 text-[0.78rem]">
              {n.requirements.slice(0, 5).map((r, i) => (
                <li key={i} className={r.ok ? "text-signal-green" : "text-ink-dim"} style={{ paddingLeft: r.depth * 10 }}>
                  {r.ok ? "✓" : "○"} {r.text}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-mute">Nothing about this file is known yet. Keep pulling threads.</p>
          )}
        </div>
      ) : (
        <Link href={nodeHref(n.id)} className="u-cta">
          {n.state === "completed" ? "Review file" : "Open file"} <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      )}
      {!openable ? (
        <p className="flex items-center gap-1.5 font-mono text-[0.68rem] text-faint">
          <Lock className="size-3" aria-hidden="true" /> Locked files open as the story reaches them.
        </p>
      ) : null}
    </div>
  );
}
