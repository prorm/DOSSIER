"use client";

/* eslint-disable react-hooks/immutability -- three.js objects (geometry attributes, uniforms, cameras, the renderer's canvas) are mutated imperatively by design; none of it runs during render. */

import { OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import gsap from "gsap";
import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";

import { sceneBudget, type Tier } from "@/components/experience/motion";
import { FAMILY_LABEL } from "@/lib/modes";
import type { ThemeDef } from "@/lib/experience/themes";
import { STRATA_MARGIN, type Shape, type UNode, type UniverseModel, type UState, type Vec3 } from "@/lib/experience/universe";
import { prng, teamDressing } from "@/lib/experience/variation";
import { createActStrip, createCardAtlas, STRIP_H, type CardAtlas } from "./card-atlas";
import { BACKDROP_GRID_FRAG, BACKDROP_NEBULA_FRAG, HALO_CARD_FRAG, HALO_FRAG, HALO_VERT, NODE_FRAG, NODE_VERT, RIBBON_FRAG, RIBBON_VERT } from "./shaders";

/** Post-processing is its own chunk: low-end devices never download it. */
const Post = lazy(() => import("./universe-post"));

export type SceneMode = "player" | "ops" | "author";
export type Posture = "focus" | "overview";

export interface TeamPin {
  id: string;
  name: string;
  nodeId: string | null;
  stuck: boolean;
  active: boolean;
  rank: number;
}

export interface SceneProps {
  model: UniverseModel;
  theme: ThemeDef;
  mode: SceneMode;
  posture: Posture;
  selectedId: string | null;
  hoveredId: string | null;
  onSelect: (id: string | null) => void;
  onHover: (id: string | null) => void;
  onHoverTeam?: (id: string | null) => void;
  tier: Tier;
  /** Files whose tags are shown, and where the scene reports their screen positions. */
  labelIds: string[];
  labelSink: LabelSink;
  /** Where each act's name hangs on screen (keyed by act id), when the stage shows act labels. */
  actSink?: LabelSink;
  fingerprint: string;
  pins?: TeamPin[];
  /** Ripples answering real events: { node id, monotonically increasing key }. */
  pulses?: { id: string; key: number }[];
  /** Author mode: node ids highlighted as the critical path. */
  path?: string[];
  /** Author mode: nodes appear progressively up to this count (build animation). */
  reveal?: number;
  /** Same, but animated without re-rendering React: the scene reads the ref every frame. A fraction grows the next thread. */
  revealRef?: React.MutableRefObject<number>;
  paused: boolean;
  /** Render a first frame (shaders compiled) but run no clock until released. */
  hold?: boolean;
  /** Pixels to shift the picture's centre to the right (keeps the action clear of a side panel). */
  viewShift?: number;
  intro: boolean;
  onFail?: () => void;
  onReady?: () => void;
  /** Ask the rig to fly here (set a new object to trigger). */
  fly?: { target: Vec3; distance?: number; key: number } | null;
}

const STATE_INDEX: Record<UState, number> = { locked: 0, discovered: 1, available: 2, completed: 3, failed: 4 };
const PAPER = new THREE.Color("#efe6cf");

/* ─────────────────────────── helpers ─────────────────────────── */

const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();

function geometryFor(style: ThemeDef["universe"]["nodeStyle"], shape: Shape): THREE.BufferGeometry {
  let g: THREE.BufferGeometry;
  if (style === "orb") g = new THREE.SphereGeometry(shape === "ring" ? 0.85 : shape === "octa" ? 1.15 : 0.95, 28, 18);
  else if (style === "card") g = new THREE.BoxGeometry(2.7, 3.3, 0.1);
  else if (style === "pulse") g = new THREE.OctahedronGeometry(shape === "octa" ? 0.95 : 0.7, 0);
  else {
    switch (shape) {
      case "ico":
        g = new THREE.IcosahedronGeometry(1.05, 0);
        break;
      case "box":
        g = new THREE.BoxGeometry(1.5, 1.5, 1.5);
        break;
      case "octa":
        g = new THREE.OctahedronGeometry(1.2, 0);
        break;
      case "prism":
        g = new THREE.CylinderGeometry(0.95, 0.95, 1.5, 6, 1);
        break;
      case "ring":
        g = new THREE.TorusGeometry(0.95, 0.3, 10, 28);
        break;
    }
  }
  // Flat facets for crystals and cards, smooth for orbs.
  if (style !== "orb") {
    g = g.index ? g.toNonIndexed() : g;
    g.computeVertexNormals();
  }
  return g;
}

function stateColor(theme: ThemeDef, n: UNode, mode: SceneMode, inPath: boolean): THREE.Color {
  const C = theme.universe.colors;
  const hex = n.state === "locked" ? C.locked : n.state === "discovered" ? C.discovered : n.state === "available" ? C.available : n.state === "completed" ? C.completed : C.failed;
  const c = new THREE.Color(hex);
  if (n.suspicious) c.lerp(new THREE.Color(C.suspicious), 0.55);
  if (mode === "author" && inPath) c.lerp(new THREE.Color(C.suspicious), 0.5);
  if (mode === "ops") {
    // Heat: how many teams are stuck here.
    const stuck = Number(n.meta.stuck ?? 0);
    const reached = Number(n.meta.reached ?? 0);
    if (stuck > 0) c.lerp(new THREE.Color(C.suspicious), Math.min(0.85, 0.35 + stuck * 0.18));
    else if (reached === 0) c.set(C.locked);
  }
  return c;
}

/** Cubic-ish position along the edge for a quadratic Bezier. */
function bezier(a: Vec3, c: Vec3, b: Vec3, t: number, out: THREE.Vector3) {
  const u = 1 - t;
  return out.set(u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1], u * u * a[2] + 2 * u * t * c[2] + t * t * b[2]);
}

/**
 * Smallest distance along `dir` (target → camera) at which every point sits
 * inside the frustum. A real perspective fit, so a 105-unit-deep stack of acts
 * is framed as tightly as a flat wall.
 */
function fitDistance(points: Vec3[], center: Vec3, dir: Vec3, fovDeg: number, aspect: number): number {
  const d = new THREE.Vector3(...dir).normalize();
  const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), d);
  if (right.lengthSq() < 1e-4) right.set(1, 0, 0);
  right.normalize();
  const up = new THREE.Vector3().crossVectors(d, right);
  const tanV = Math.tan((fovDeg * Math.PI) / 360);
  const tanH = tanV * Math.max(0.4, aspect);
  const rel = new THREE.Vector3();
  let D = 0;
  for (const p of points) {
    rel.set(p[0] - center[0], p[1] - center[1], p[2] - center[2]);
    const z = rel.dot(d);
    D = Math.max(D, z + Math.abs(rel.dot(right)) / tanH, z + Math.abs(rel.dot(up)) / tanV);
  }
  return D;
}

const DIRS: Record<UniverseModel["layout"], { focus: Vec3; overview: Vec3 }> = {
  // Oblique on purpose: the finished layers read as a trail leading into the frontier instead of a wall in the lens.
  strata: { focus: [0.72, 0.3, 0.62], overview: [0.82, 0.3, 0.5] },
  organic: { focus: [0.15, 0.25, 1], overview: [0.2, 0.35, 1] },
  wall: { focus: [0, 0.02, 1], overview: [0, 0.02, 1] },
  tunnel: { focus: [0.2, 0.14, 1], overview: [0.62, 0.26, 0.75] },
};

/** Everything the overview must keep in frame: each file's extent, and on the wall the act headers too. */
function framePoints(model: UniverseModel): Vec3[] {
  const pts: Vec3[] = [];
  const wall = model.layout === "wall";
  for (const n of model.nodes) {
    const hx = wall ? 1.4 * n.radius : n.radius;
    const hy = wall ? 1.7 * n.radius : n.radius;
    pts.push([n.pos[0] - hx, n.pos[1] - hy, n.pos[2]], [n.pos[0] + hx, n.pos[1] + hy, n.pos[2]]);
  }
  if (wall) for (const a of model.acts) if (a.span) pts.push([a.anchor[0] - a.span / 2, a.anchor[1] + 0.7, 0], [a.anchor[0] + a.span / 2, a.anchor[1] + 0.7, 0]);
  // The act names are the map's structure: on a narrow portrait screen they must not fall off the sides.
  // A name runs right from a layer's corner (strata) or sits centred on its anchor (elsewhere); ~6 units covers it.
  if (!wall)
    for (const a of model.acts)
      if (a.count) pts.push(model.layout === "strata" ? a.anchor : [a.anchor[0] - 3, a.anchor[1], a.anchor[2]], [a.anchor[0] + (model.layout === "strata" ? 6 : 3), a.anchor[1], a.anchor[2]]);
  return pts.length ? pts : [[0, 0, 0]];
}

function poseFor(model: UniverseModel, theme: ThemeDef, posture: Posture, aspect: number): { target: Vec3; position: Vec3 } {
  const f = model.focus;
  const b = model.bounds;
  const fov = theme.universe.fov;
  const dirs = DIRS[model.layout];
  if (posture === "overview") {
    const pts = framePoints(model);
    const ys = pts.map((p) => p[1]);
    const t: Vec3 = model.layout === "wall" ? [(Math.min(...pts.map((p) => p[0])) + Math.max(...pts.map((p) => p[0]))) / 2, (Math.min(...ys) + Math.max(...ys)) / 2, 0] : b.center;
    const dir = dirs.overview;
    const dist = fitDistance(pts, t, dir, fov, aspect) * (model.layout === "wall" ? 1.08 : 1.18) + 5;
    const l = Math.hypot(...dir);
    return { target: t, position: [t[0] + (dir[0] / l) * dist, t[1] + (dir[1] / l) * dist, t[2] + (dir[2] / l) * dist] };
  }
  if (model.layout === "tunnel") {
    // Inside the tunnel: just behind the nearest open file, looking down the carrier toward what is still ahead.
    // What is finished is behind the lens; what is locked recedes into the static.
    const open = model.nodes.filter((n) => n.state === "available" || n.state === "discovered");
    const set = open.length ? open : model.nodes.filter((n) => n.state === "completed").slice(-2);
    const zNear = set.length ? Math.max(...set.map((n) => n.pos[2])) : f[2];
    return { target: [f[0] * 0.2, f[1] * 0.2, zNear - 16], position: [f[0] * 0.12 + 0.9, f[1] * 0.12 + 1.2, zNear + 11.5] };
  }
  // Focus: frame the frontier and whatever is close to it.
  const near = model.nodes.filter((n) => Math.hypot(n.pos[0] - f[0], n.pos[1] - f[1], n.pos[2] - f[2]) < (model.layout === "wall" ? 17 : 15)).map((n) => n.pos);
  let dir = dirs.focus;
  let target: Vec3 = model.layout === "wall" ? [f[0], f[1], 0] : f;
  if (model.layout === "organic") {
    const out = new THREE.Vector3(f[0] - b.center[0], f[1] - b.center[1] + 0.3 * b.radius, f[2] - b.center[2]);
    if (out.length() < 1) out.set(0, 0.25, 1);
    out.normalize();
    dir = [out.x, out.y, out.z];
    target = [(f[0] * 2 + b.center[0]) / 3, (f[1] * 2 + b.center[1]) / 3, (f[2] * 2 + b.center[2]) / 3];
  }
  const dist = Math.max(model.layout === "wall" ? 26 : 24, fitDistance(near.length ? near : [f], target, dir, fov, aspect) * (model.layout === "wall" ? 1.35 : 1.75) + 6);
  const l = Math.hypot(...dir);
  return { target, position: [target[0] + (dir[0] / l) * dist, target[1] + (dir[1] / l) * dist, target[2] + (dir[2] / l) * dist] };
}

/* ─────────────────────────── camera rig ─────────────────────────── */

function CameraRig({ model, theme, posture, selectedId, fly, intro, controlsRef, onInteract, quiet, shift }: {
  model: UniverseModel;
  theme: ThemeDef;
  posture: Posture;
  selectedId: string | null;
  fly: SceneProps["fly"];
  intro: boolean;
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
  onInteract: () => void;
  quiet: boolean;
  /** The view offset in px: the frame is fitted to what is left beside the panel it clears. */
  shift: number;
}) {
  const { camera, gl, size } = useThree();
  // On the console (focus, wide) instrument columns sit on both sides (~400px left, ~330px right): frame the
  // frontier into the gap between them, not into the whole window, so no file sits under the briefing.
  const free = posture === "focus" && shift > 0 && size.width >= 1100 ? size.width - 740 : size.width - 2 * Math.abs(shift);
  const aspect = Math.max(0.3, free) / Math.max(1, size.height);
  const tween = useRef<gsap.core.Tween | null>(null);
  const lastPosture = useRef<Posture | null>(null);
  const lastSelected = useRef<string | null>(null);
  const lastFly = useRef<number>(-1);
  const layoutKey = `${model.layout}:${model.nodes.length}`;

  const flyTo = useCallback(
    (target: Vec3, distance: number | null, duration = 1.15, absolute?: Vec3) => {
      const c = controlsRef.current;
      if (!c) return;
      tween.current?.kill();
      const sT = c.target.clone();
      const sP = camera.position.clone();
      const eT = new THREE.Vector3(...target);
      let eP: THREE.Vector3;
      if (absolute) eP = new THREE.Vector3(...absolute);
      else {
        const dir = sP.clone().sub(sT).normalize();
        eP = eT.clone().add(dir.multiplyScalar(distance ?? sP.distanceTo(sT)));
      }
      const k = { t: 0 };
      tween.current = gsap.to(k, {
        t: 1,
        duration,
        ease: "power3.inOut",
        onUpdate: () => {
          c.target.lerpVectors(sT, eT, k.t);
          camera.position.lerpVectors(sP, eP, k.t);
          c.update();
        },
      });
    },
    [camera, controlsRef],
  );

  // First pose (with a slow dolly-in for the arrival) and posture changes.
  useLayoutEffect(() => {
    const c = controlsRef.current;
    if (!c) return;
    const pose = poseFor(model, theme, posture, aspect);
    // A tall phone needs the camera much further back to fit the whole case across its narrow width; a fixed
    // orbit limit would clamp it in and crop the map's sides. The limit always admits the pose it is given.
    const poseDist = Math.hypot(pose.position[0] - pose.target[0], pose.position[1] - pose.target[1], pose.position[2] - pose.target[2]);
    c.maxDistance = Math.max(c.maxDistance, poseDist * 1.25);
    if (lastPosture.current === null) {
      const far = new THREE.Vector3(...pose.position).sub(new THREE.Vector3(...pose.target)).multiplyScalar(intro && !quiet ? 1.7 : 1).add(new THREE.Vector3(...pose.target));
      camera.position.copy(far);
      c.target.set(...pose.target);
      c.update();
      if (intro && !quiet) flyTo(pose.target, null, 2.4, pose.position);
    } else if (lastPosture.current !== posture) flyTo(pose.target, null, 1.4, pose.position);
    lastPosture.current = posture;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posture, layoutKey]);

  // Selecting a file glides the camera to it (keeping the viewing direction).
  useEffect(() => {
    if (selectedId === lastSelected.current) return;
    lastSelected.current = selectedId;
    if (!selectedId) return;
    const n = model.nodes[model.byId.get(selectedId) ?? -1];
    if (n) flyTo(n.pos, model.layout === "wall" ? 22 : 15, 1.05);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  // Explicit fly requests (recenter, act chips, new discoveries).
  useEffect(() => {
    if (!fly || fly.key === lastFly.current) return;
    lastFly.current = fly.key;
    flyTo(fly.target, fly.distance ?? null, 1.2);
  }, [fly, flyTo]);

  useEffect(() => {
    const c = controlsRef.current;
    if (!c) return;
    const stop = () => {
      tween.current?.kill();
      onInteract();
    };
    c.addEventListener("start", stop);
    return () => c.removeEventListener("start", stop);
  }, [controlsRef, onInteract]);

  useEffect(() => () => void tween.current?.kill(), []);

  // Limit how far the audience can wander from the story.
  const u = theme.universe;
  const wall = model.layout === "wall";
  void gl;
  return (
    <OrbitControls
      ref={controlsRef as never}
      makeDefault
      enableDamping
      dampingFactor={0.075}
      rotateSpeed={0.5}
      zoomSpeed={0.7}
      panSpeed={0.8}
      screenSpacePanning
      minDistance={wall ? 10 : 6}
      maxDistance={Math.max(u.distance * 3, model.bounds.radius * 4.5)}
      minPolarAngle={wall ? 1.25 : 0.35}
      maxPolarAngle={wall ? 1.9 : 2.25}
      minAzimuthAngle={wall ? -0.45 : -Infinity}
      maxAzimuthAngle={wall ? 0.45 : Infinity}
      autoRotate={false}
    />
  );
}

/* ─────────────────────────── nodes + halos ─────────────────────────── */

interface Group {
  shape: Shape;
  ids: number[];
  geometry: THREE.BufferGeometry;
  attrs: { data: THREE.InstancedBufferAttribute; flags: THREE.InstancedBufferAttribute; color: THREE.InstancedBufferAttribute; pulse: THREE.InstancedBufferAttribute };
}

function Nodes({ model, theme, mode, selectedId, hoveredId, path, pulses, reveal, revealRef, intro, fingerprint, pins, paused, tier }: Pick<SceneProps, "model" | "theme" | "mode" | "selectedId" | "hoveredId" | "path" | "pulses" | "reveal" | "revealRef" | "intro" | "fingerprint" | "pins" | "paused" | "tier">) {
  const n = model.nodes.length;
  /** How many files exist right now. Only the author's build animation ever holds any back. */
  const revealAt = useCallback(() => (mode === "author" ? (revealRef?.current ?? reveal ?? n) : n), [mode, revealRef, reveal, n]);
  const lastReveal = useRef<number | null>(null);
  const style = theme.universe.nodeStyle;
  const fog = useMemo(() => new THREE.Color(theme.universe.colors.fog), [theme]);
  const warm = useMemo(() => new THREE.Color(theme.universe.warmth > 0 ? "#ffcf8a" : "#8fb8ff"), [theme]);
  const paper = style === "card";
  // Inside the tunnel files pass close to the lens by design; they dissolve before they fill the frame
  // (the nearest open file sits ~11.5 units ahead and keeps its full size).
  const nearFade = useMemo(() => (model.layout === "tunnel" ? new THREE.Vector2(2.5, 7) : new THREE.Vector2(3.5, 12)), [model.layout]);
  // ...and rather than dissolve there, they shrink away as they fly past.
  const shrink = useMemo(() => (model.layout === "tunnel" ? new THREE.Vector2(4.5, 11) : new THREE.Vector2(0, 0)), [model.layout]);

  // Index cards carry their file's typed face (code, title, family, points). Solids need none.
  const atlas = useMemo<CardAtlas | null>(() => (paper && n ? createCardAtlas(n, tier === "low" ? "low" : "full") : null), [paper, n, tier]);
  useEffect(() => () => atlas?.dispose(), [atlas]);
  const dressFaces = useMemo(() => teamDressing(fingerprint), [fingerprint]);
  useEffect(() => {
    if (!atlas) return;
    atlas.draw(
      model.nodes.map((nn) => ({
        code: dressFaces.fileCode(nn.id),
        title: nn.title,
        family: FAMILY_LABEL[nn.family] ?? nn.family,
        points: nn.state === "locked" ? null : nn.points,
        state: nn.state,
        scheduled: nn.scheduled,
      })),
    );
  }, [atlas, model, dressFaces]);

  const nodeMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: NODE_VERT,
        fragmentShader: NODE_FRAG,
        uniforms: {
          uTime: { value: 0 },
          uFog: { value: fog },
          uFogDensity: { value: theme.universe.fogDensity },
          uWarm: { value: warm },
          uCard: { value: paper ? 1 : 0 },
          uCardV: { value: paper ? 1 : 0 },
          uPaper: { value: PAPER },
          uInk: { value: new THREE.Color("#2a2418") },
          uAtlas: { value: atlas?.texture ?? null },
          uGrid: { value: new THREE.Vector2(atlas?.cols ?? 0, atlas?.rows ?? 0) },
          uNear: { value: nearFade },
          uShrink: { value: shrink },
        },
      }),
    [fog, warm, theme, paper, atlas, nearFade, shrink],
  );
  const haloMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: HALO_VERT,
        fragmentShader: paper ? HALO_CARD_FRAG : HALO_FRAG,
        uniforms: { uTime: { value: 0 }, uNear: { value: nearFade }, uShrink: { value: shrink } },
        transparent: true,
        depthWrite: false,
        // Paper casts shadows on a lit wall (darkening); light in the dark adds up.
        blending: paper ? THREE.NormalBlending : THREE.AdditiveBlending,
      }),
    [paper, nearFade, shrink],
  );
  useEffect(() => () => void (nodeMat.dispose(), haloMat.dispose()), [nodeMat, haloMat]);

  // Master per-node state (mutable, animated in the frame loop).
  const spawn = useRef<Float32Array>(new Float32Array(0));
  const pulse = useRef<Float32Array>(new Float32Array(0));
  const prevStates = useRef<Map<string, UState>>(new Map());
  const seenPulseKey = useRef<Map<string, number>>(new Map());
  const dirty = useRef(true);

  const groups = useMemo<Group[]>(() => {
    const by = new Map<Shape, number[]>();
    model.nodes.forEach((nn, i) => by.set(nn.shape, [...(by.get(nn.shape) ?? []), i]));
    // Non-crystal styles use one geometry for everything (still one draw call per shape group so sizes can differ).
    return [...by.entries()].map(([shape, ids]) => {
      const geometry = geometryFor(style, shape);
      const mk = (size: number) => new THREE.InstancedBufferAttribute(new Float32Array(ids.length * size), size);
      const attrs = { data: mk(4), flags: mk(4), color: mk(3), pulse: mk(1) };
      geometry.setAttribute("aData", attrs.data);
      geometry.setAttribute("aFlags", attrs.flags);
      geometry.setAttribute("aColor", attrs.color);
      geometry.setAttribute("aPulse", attrs.pulse);
      // Which atlas cell holds this file's face: its index in the model (static per model).
      geometry.setAttribute("aCell", new THREE.InstancedBufferAttribute(Float32Array.from(ids), 1));
      return { shape, ids, geometry, attrs };
    });
  }, [model, style]);
  useEffect(() => () => groups.forEach((g) => g.geometry.dispose()), [groups]);

  const meshes = useRef<(THREE.InstancedMesh | null)[]>([]);
  const halo = useRef<THREE.InstancedMesh>(null);
  const haloGeo = useMemo(() => {
    const g = new THREE.PlaneGeometry(2, 2);
    const mk = (size: number) => new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, n) * size), size);
    g.setAttribute("aData", mk(4));
    g.setAttribute("aFlags", mk(4));
    g.setAttribute("aColor", mk(3));
    g.setAttribute("aPulse", mk(1));
    g.setAttribute("aSize", mk(1));
    g.setAttribute("aRot", mk(1));
    return g;
  }, [n]);
  useEffect(() => () => haloGeo.dispose(), [haloGeo]);

  // New model → detect what changed in the world and animate exactly that.
  useLayoutEffect(() => {
    if (spawn.current.length !== n) {
      spawn.current = new Float32Array(n).fill(1);
      pulse.current = new Float32Array(n).fill(1);
    }
    const revealN = revealAt();
    // "First" is derived (nothing remembered yet) so React StrictMode's double effect run cannot skip the intro.
    const first = prevStates.current.size === 0;
    model.nodes.forEach((nn, i) => {
      const before = prevStates.current.get(nn.id);
      if (first) {
        spawn.current[i] = intro ? -0.04 * i : 1;
      } else if (before === undefined) {
        spawn.current[i] = 0;
      } else if (before !== nn.state) {
        // A real change: a ripple through the node that changed.
        pulse.current[i] = 0;
        if (before === "locked" || before === "discovered") if (nn.state === "available" || nn.state === "discovered") spawn.current[i] = Math.min(spawn.current[i]!, 0.25);
      }
      prevStates.current.set(nn.id, nn.state);
      if (mode === "author" && i >= revealN) spawn.current[i] = Math.min(spawn.current[i]!, 0);
    });
    dirty.current = true;
  }, [model, n, intro, mode, revealAt]);

  // External event ripples (ops: a team solved this).
  useLayoutEffect(() => {
    for (const p of pulses ?? []) {
      if (seenPulseKey.current.get(p.id) === p.key) continue;
      seenPulseKey.current.set(p.id, p.key);
      const i = model.byId.get(p.id);
      if (i !== undefined && pulse.current.length) pulse.current[i] = 0;
    }
    dirty.current = true;
  }, [pulses, model]);

  const inPath = useMemo(() => new Set(path ?? []), [path]);

  const write = useCallback(() => {
    const master = { data: new Float32Array(n * 4), flags: new Float32Array(n * 4), color: new Float32Array(n * 3) };
    const dress = teamDressing(fingerprint);
    const revealN = revealAt();
    model.nodes.forEach((nn, i) => {
      const c = stateColor(theme, nn, mode, inPath.has(nn.id));
      master.color.set([c.r, c.g, c.b], i * 3);
      const hidden = mode === "author" && i >= revealN;
      master.data.set([hidden ? 0 : nn.energy * (mode === "author" ? 1 : 1), STATE_INDEX[nn.state], dress.noise(nn.id), Math.max(0, Math.min(1, spawn.current[i] ?? 1))], i * 4);
      master.flags.set([nn.isNew || (mode === "author" && inPath.has(nn.id)) ? 1 : 0, nn.suspicious ? 1 : 0, nn.id === selectedId ? 1 : 0, nn.id === hoveredId ? 1 : 0], i * 4);
    });
    // Solids
    const dummy = new THREE.Object3D();
    groups.forEach((g, gi) => {
      g.ids.forEach((nodeIdx, k) => {
        const nn = model.nodes[nodeIdx]!;
        master.data.slice(nodeIdx * 4, nodeIdx * 4 + 4).forEach((v, j) => (g.attrs.data.array[k * 4 + j] = v));
        master.flags.slice(nodeIdx * 4, nodeIdx * 4 + 4).forEach((v, j) => (g.attrs.flags.array[k * 4 + j] = v));
        master.color.slice(nodeIdx * 3, nodeIdx * 3 + 3).forEach((v, j) => (g.attrs.color.array[k * 3 + j] = v));
        g.attrs.pulse.array[k] = pulse.current[nodeIdx] ?? 1;
        dummy.position.set(...nn.pos);
        dummy.rotation.set(0, 0, paper ? nn.rot : 0);
        dummy.scale.setScalar(nn.radius * (paper ? 1 : 1));
        dummy.updateMatrix();
        meshes.current[gi]?.setMatrixAt(k, dummy.matrix);
      });
      g.attrs.data.needsUpdate = g.attrs.flags.needsUpdate = g.attrs.color.needsUpdate = g.attrs.pulse.needsUpdate = true;
      const m = meshes.current[gi];
      if (m) m.instanceMatrix.needsUpdate = true;
    });
    // Halos
    const a = haloGeo.attributes;
    (a.aData!.array as Float32Array).set(master.data);
    (a.aFlags!.array as Float32Array).set(master.flags);
    (a.aColor!.array as Float32Array).set(master.color);
    model.nodes.forEach((nn, i) => {
      (a.aPulse!.array as Float32Array)[i] = pulse.current[i] ?? 1;
      (a.aSize!.array as Float32Array)[i] = nn.radius * (paper ? 2.6 : style === "pulse" ? 2.7 : 2.55);
      (a.aRot!.array as Float32Array)[i] = paper ? nn.rot : 0;
      dummy.position.set(...nn.pos);
      // A card's shadow lies on the cork just behind it; a halo sits on its file.
      if (paper) dummy.position.z -= 0.12;
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      halo.current?.setMatrixAt(i, dummy.matrix);
    });
    for (const k of ["aData", "aFlags", "aColor", "aPulse", "aSize", "aRot"]) (a[k] as THREE.BufferAttribute).needsUpdate = true;
    if (halo.current) halo.current.instanceMatrix.needsUpdate = true;
  }, [model, theme, mode, groups, haloGeo, fingerprint, selectedId, hoveredId, inPath, n, paper, style, revealAt]);

  // Selection/hover changes are cheap: rewrite the (tiny) buffers.
  useLayoutEffect(() => {
    write();
    dirty.current = false;
  }, [write, groups]);

  useFrame((state, dt) => {
    if (paused) return;
    const t = state.clock.elapsedTime;
    nodeMat.uniforms.uTime!.value = t;
    haloMat.uniforms.uTime!.value = t;
    let animating = false;
    // The build animation: a file is born the moment the count passes it.
    const now = revealAt();
    if (mode === "author") {
      const last = lastReveal.current;
      if (last === null) lastReveal.current = now;
      else if (now !== last) {
        for (let i = 0; i < spawn.current.length; i++) if (i < last !== i < now) spawn.current[i] = 0;
        lastReveal.current = now;
        dirty.current = true;
      }
    }
    for (let i = 0; i < spawn.current.length; i++) {
      if (mode === "author" && i >= now) continue;
      if ((spawn.current[i] ?? 1) < 1) {
        spawn.current[i] = spawn.current[i]! + dt / 0.85;
        animating = true;
      }
      if ((pulse.current[i] ?? 1) < 1) {
        pulse.current[i] = Math.min(1, pulse.current[i]! + dt / 1.6);
        animating = true;
      }
    }
    if (animating || dirty.current) {
      write();
      dirty.current = false;
    }
  });

  void pins;
  return (
    <group>
      {groups.map((g, gi) => (
        <instancedMesh key={`${g.shape}:${g.ids.length}:${style}`} ref={(m) => void (meshes.current[gi] = m)} args={[g.geometry, nodeMat, g.ids.length]} frustumCulled={false} raycast={() => null} />
      ))}
      <instancedMesh ref={halo} args={[haloGeo, haloMat, Math.max(1, n)]} frustumCulled={false} raycast={() => null} renderOrder={4} />
    </group>
  );
}

/* ─────────────────────────── edges ─────────────────────────── */

function Edges({ model, theme, paused, path, mode, reveal, revealRef }: Pick<SceneProps, "model" | "theme" | "paused" | "path" | "mode" | "reveal" | "revealRef">) {
  const { size, viewport, camera } = useThree();
  const dpr = viewport.dpr;
  const S = 30;
  const style = theme.universe.edgeStyle;
  const inPath = useMemo(() => new Set(path ?? []), [path]);
  const geometry = useMemo(() => {
    const E = model.edges;
    const verts = E.length * S * 2;
    const pos = new Float32Array(verts * 3);
    const prev = new Float32Array(verts * 3);
    const next = new Float32Array(verts * 3);
    const side = new Float32Array(verts);
    const tt = new Float32Array(verts);
    const info = new Float32Array(verts * 3);
    const birth = new Float32Array(verts);
    const index: number[] = [];
    const p = new THREE.Vector3();
    const pts: THREE.Vector3[] = [];
    E.forEach((e, ei) => {
      pts.length = 0;
      const A = model.nodes[e.from]!;
      const B = model.nodes[e.to]!;
      const dist = Math.hypot(B.pos[0] - A.pos[0], B.pos[1] - A.pos[1], B.pos[2] - A.pos[2]) || 1;
      // String is tied at the pins (the model already put its ends there); threads stop short of their files.
      const tied = style === "string";
      const t0 = tied ? 0 : Math.min(0.32, (A.radius * 1.55) / dist);
      const t1 = tied ? 1 : 1 - Math.min(0.32, (B.radius * 1.55) / dist);
      for (let s = 0; s < S; s++) pts.push(bezier(e.a, e.ctrl, e.b, t0 + ((t1 - t0) * s) / (S - 1), p).clone());
      // Author view: the critical path pulses, fact flow is dashed, every other gate is a steady thread.
      const flow = mode === "author" ? (inPath.has(A.id) && inPath.has(B.id) ? 1 : e.kind === "fact" ? 0 : 2) : e.flow === "live" ? 1 : e.flow === "done" ? 2 : 0;
      // A thread is born with the later of its two files.
      const born = Math.max(e.from, e.to);
      // String reads by weight: the lead you can pull now is heavy thread, finished runs older, dormant ones thin.
      const width = style === "string" ? (flow === 1 ? 1.25 : flow === 2 ? 0.85 : 0.6) : style === "filament" ? 0.8 : style === "wave" ? 0.9 : 1;
      const seed = ((ei * 7919) % 97) / 97;
      pts.forEach((q, s) => {
        for (const sd of [-1, 1]) {
          const vi = (ei * S + s) * 2 + (sd === 1 ? 1 : 0);
          const pr = pts[Math.max(0, s - 1)]!;
          const nx = pts[Math.min(S - 1, s + 1)]!;
          pos.set([q.x, q.y, q.z], vi * 3);
          prev.set([pr.x, pr.y, pr.z], vi * 3);
          next.set([nx.x, nx.y, nx.z], vi * 3);
          side[vi] = sd;
          tt[vi] = s / (S - 1);
          info.set([flow, width, seed], vi * 3);
          birth[vi] = born;
        }
        if (s < S - 1) {
          const b = (ei * S + s) * 2;
          index.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
        }
      });
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aPrev", new THREE.BufferAttribute(prev, 3));
    g.setAttribute("aNext", new THREE.BufferAttribute(next, 3));
    g.setAttribute("aSide", new THREE.BufferAttribute(side, 1));
    g.setAttribute("aT", new THREE.BufferAttribute(tt, 1));
    g.setAttribute("aInfo", new THREE.BufferAttribute(info, 3));
    g.setAttribute("aBirth", new THREE.BufferAttribute(birth, 1));
    g.setIndex(index);
    return g;
  }, [model, style, mode, inPath]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: RIBBON_VERT,
        fragmentShader: RIBBON_FRAG,
        transparent: true,
        depthWrite: false,
        blending: theme.scheme === "light" ? THREE.NormalBlending : THREE.AdditiveBlending,
        uniforms: {
          uPx: { value: 0.001 },
          uWidth: { value: 1.6 },
          uTime: { value: 0 },
          uWave: { value: style === "wave" ? 0.55 : 0 },
          uBase: { value: new THREE.Color(theme.universe.colors.edge) },
          uLive: { value: new THREE.Color(theme.universe.colors.edgeLive) },
          uFog: { value: new THREE.Color(theme.universe.colors.fog) },
          uStyle: { value: style === "beam" ? 0 : style === "filament" ? 1 : style === "string" ? 2 : 3 },
          uReveal: { value: 1e6 },
        },
      }),
    [theme, style],
  );
  useEffect(() => () => mat.dispose(), [mat]);
  useFrame((s) => {
    if (paused) return;
    mat.uniforms.uTime!.value = s.clock.elapsedTime;
    const fov = ((camera as THREE.PerspectiveCamera).fov * Math.PI) / 180;
    mat.uniforms.uPx!.value = (2 * Math.tan(fov / 2)) / (size.height * dpr);
    mat.uniforms.uWidth!.value = (style === "string" ? 3.2 : style === "filament" ? 1.7 : 2.0) * dpr;
    mat.uniforms.uReveal!.value = mode === "author" ? (revealRef?.current ?? reveal ?? 1e6) : 1e6;
  });
  if (!model.edges.length) return null;
  return <mesh geometry={geometry} material={mat} frustumCulled={false} renderOrder={2} raycast={() => null} />;
}

/* ─────────────────────────── backdrops ─────────────────────────── */

const PLANE_VERT = `varying vec3 vWorld; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const DOME_VERT = `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position,1.0); }`;

function GridVoid({ model, theme, paused, current }: { model: UniverseModel; theme: ThemeDef; paused: boolean; current: number }) {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: PLANE_VERT,
        fragmentShader: BACKDROP_GRID_FRAG,
        transparent: true,
        depthWrite: false,
        uniforms: { uTime: { value: 0 }, uLine: { value: new THREE.Color(theme.universe.colors.edge) }, uBg: { value: new THREE.Color(theme.universe.colors.backdrop) }, uFocus: { value: new THREE.Vector3(...model.focus) } },
      }),
    [theme, model.focus],
  );
  useEffect(() => () => mat.dispose(), [mat]);
  useFrame((s) => {
    if (!paused) mat.uniforms.uTime!.value = s.clock.elapsedTime;
  });
  const b = model.bounds;
  // One outlined slab per act: the layers of the investigation.
  const slabs = useMemo(() => {
    const w = (b.max[0] - b.min[0]) / 2 + STRATA_MARGIN.x;
    const h = (b.max[1] - b.min[1]) / 2 + STRATA_MARGIN.y;
    return model.acts.map((a) => {
      const pts = [new THREE.Vector3(-w, -h, 0), new THREE.Vector3(w, -h, 0), new THREE.Vector3(w, h, 0), new THREE.Vector3(-w, h, 0), new THREE.Vector3(-w, -h, 0)];
      const g = new THREE.BufferGeometry().setFromPoints(pts);
      return { g, z: a.z, index: a.index, started: a.started };
    });
  }, [model.acts, b]);
  useEffect(() => () => slabs.forEach((s) => s.g.dispose()), [slabs]);
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[model.focus[0], b.min[1] - 9, model.focus[2]]} renderOrder={0} raycast={() => null}>
        <planeGeometry args={[520, 520]} />
        <primitive object={mat} attach="material" />
      </mesh>
      {model.layout === "strata"
        ? slabs.map((s) => (
            <lineLoop key={s.index} geometry={s.g} position={[(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, s.z - 2.2]} renderOrder={1}>
              <lineBasicMaterial color={theme.universe.colors.edge} transparent opacity={s.index === current ? 0.55 : s.started ? 0.22 : 0.09} depthWrite={false} />
            </lineLoop>
          ))
        : null}
    </group>
  );
}

function Nebula({ theme, paused }: { theme: ThemeDef; paused: boolean }) {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: DOME_VERT,
        fragmentShader: BACKDROP_NEBULA_FRAG,
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: { uTime: { value: 0 }, uA: { value: new THREE.Color(theme.universe.colors.backdrop) }, uB: { value: new THREE.Color(theme.universe.colors.locked).lerp(new THREE.Color(theme.brand), 0.35) } },
      }),
    [theme],
  );
  useEffect(() => () => mat.dispose(), [mat]);
  useFrame((s) => {
    if (!paused) mat.uniforms.uTime!.value = s.clock.elapsedTime;
  });
  return (
    <mesh renderOrder={-10} raycast={() => null}>
      <sphereGeometry args={[260, 32, 20]} />
      <primitive object={mat} attach="material" />
    </mesh>
  );
}

/** Cork + lamp: the evidence wall behind the pinned cards. */
function Wall({ model, theme }: { model: UniverseModel; theme: ThemeDef }) {
  const cork = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 512;
    const x = c.getContext("2d")!;
    x.fillStyle = "#8a6a45";
    x.fillRect(0, 0, 512, 512);
    const r = (a: number) => Math.sin(a * 12.9898) * 43758.5453 % 1;
    for (let i = 0; i < 5200; i++) {
      const px = Math.abs(r(i)) * 512;
      const py = Math.abs(r(i + 7.7)) * 512;
      const s = 0.6 + Math.abs(r(i + 3.3)) * 2.6;
      x.fillStyle = `rgba(${40 + Math.abs(r(i + 1)) * 60},${25 + Math.abs(r(i + 2)) * 40},${10 + Math.abs(r(i + 4)) * 20},${0.12 + Math.abs(r(i + 5)) * 0.25})`;
      x.beginPath();
      x.arc(px, py, s, 0, 6.283);
      x.fill();
    }
    for (let i = 0; i < 1400; i++) {
      x.fillStyle = `rgba(255,${210 + Math.abs(r(i + 9)) * 40},${150 + Math.abs(r(i + 11)) * 40},${0.05 + Math.abs(r(i + 13)) * 0.1})`;
      x.fillRect(Math.abs(r(i + 15)) * 512, Math.abs(r(i + 17)) * 512, 1.5, 1.5);
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(14, 9);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
  const glow = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const x = c.getContext("2d")!;
    const g = x.createRadialGradient(128, 128, 8, 128, 128, 128);
    g.addColorStop(0, "rgba(255,236,190,0.75)");
    g.addColorStop(0.45, "rgba(255,214,140,0.22)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    x.fillStyle = g;
    x.fillRect(0, 0, 256, 256);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
  useEffect(() => () => void (cork.dispose(), glow.dispose()), [cork, glow]);
  const b = model.bounds;
  const w = b.max[0] - b.min[0] + 8;
  const h = b.max[1] - b.min[1] + 10;
  void theme;
  return (
    <group>
      <mesh position={[b.center[0], b.center[1], -3.2]} raycast={() => null}>
        <planeGeometry args={[360, 220]} />
        <meshBasicMaterial map={cork} color="#a98a63" toneMapped={false} />
      </mesh>
      {/* The desk lamp: a warm pool over the upper left of the wall, sized to the wall. */}
      <mesh position={[b.center[0] - w * 0.12, b.center[1] + h * 0.18, -3]} renderOrder={-1} raycast={() => null}>
        <planeGeometry args={[Math.max(70, w * 1.9), Math.max(50, h * 2.1)]} />
        <meshBasicMaterial map={glow} transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} opacity={0.8} />
      </mesh>
    </group>
  );
}

/** A typed manila strip over each act's column: its name once the act has begun, its real progress. */
function ActStrips({ model }: { model: UniverseModel }) {
  const strips = useMemo(
    () =>
      model.layout === "wall"
        ? model.acts
            .filter((a) => a.count > 0 && a.span > 0)
            .map((a) => ({
              key: `${a.id}:${a.started ? a.title : "x"}:${a.done}`,
              act: a,
              tex: createActStrip(a.started && a.title ? a.title : "Classified", `ACT ${ROMAN[a.index] ?? a.index + 1} · ${a.done}/${a.count}`, a.span),
            }))
        : [],
    [model.layout, model.acts],
  );
  useEffect(() => () => strips.forEach((s) => s.tex.dispose()), [strips]);
  return (
    <group>
      {strips.map(({ key, act, tex }) => (
        <group key={key} position={act.anchor}>
          <mesh position={[0.12, -0.16, -0.08]} raycast={() => null}>
            <planeGeometry args={[act.span, STRIP_H]} />
            <meshBasicMaterial color="#2a1a08" transparent opacity={0.35} depthWrite={false} toneMapped={false} />
          </mesh>
          <mesh raycast={() => null}>
            <planeGeometry args={[act.span, STRIP_H]} />
            <meshBasicMaterial map={tex} toneMapped={false} color={act.started ? "#ffffff" : "#cfc6b0"} />
          </mesh>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * (act.span / 2 - 0.3), STRIP_H / 2 - 0.26, 0.06]} raycast={() => null}>
              <circleGeometry args={[0.13, 14]} />
              <meshBasicMaterial color="#b3261e" toneMapped={false} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];

/** Concentric carrier rings down the tunnel + a live waveform along its axis. */
function Spectrum({ model, theme, paused }: { model: UniverseModel; theme: ThemeDef; paused: boolean }) {
  const rings = useMemo(() => {
    const zs: number[] = [];
    const zMin = model.bounds.min[2] - 24;
    const zMax = model.bounds.max[2] + 40;
    for (let z = zMax; z > zMin; z -= 7) zs.push(z);
    const pts: THREE.Vector3[] = [];
    const segs = 72;
    for (const z of zs) for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * Math.PI * 2;
      const a1 = ((i + 1) / segs) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a0) * 15, Math.sin(a0) * 9.5, z), new THREE.Vector3(Math.cos(a1) * 15, Math.sin(a1) * 9.5, z));
    }
    return new THREE.BufferGeometry().setFromPoints(pts);
  }, [model.bounds]);
  const axisGeo = useMemo(() => {
    const N = 260;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    return g;
  }, []);
  const axisLine = useMemo(() => new THREE.Line(axisGeo, new THREE.LineBasicMaterial({ color: theme.universe.colors.edgeLive, transparent: true, opacity: 0.28 })), [axisGeo, theme]);
  useEffect(() => () => void (rings.dispose(), axisGeo.dispose(), (axisLine.material as THREE.Material).dispose()), [rings, axisGeo, axisLine]);
  const ringRef = useRef<THREE.LineSegments>(null);
  useFrame((s) => {
    if (paused) return;
    // The carrier streams past: rings slide toward the viewer one spacing, then step back. The files stay put.
    if (ringRef.current) ringRef.current.position.z = (s.clock.elapsedTime * 1.6) % 7;
    const a = axisGeo.attributes.position as THREE.BufferAttribute;
    const N = a.count;
    const zMax = model.bounds.max[2] + 40;
    const zMin = model.bounds.min[2] - 24;
    for (let i = 0; i < N; i++) {
      const u = i / (N - 1);
      const z = zMax + (zMin - zMax) * u;
      a.setXYZ(i, Math.sin(u * 90 - s.clock.elapsedTime * 3) * 0.9 * (0.4 + 0.6 * Math.sin(u * 7 + s.clock.elapsedTime)), Math.cos(u * 61 - s.clock.elapsedTime * 2) * 0.6, z);
    }
    a.needsUpdate = true;
  });
  return (
    <group>
      <lineSegments ref={ringRef} geometry={rings} renderOrder={0}>
        <lineBasicMaterial color={theme.universe.colors.edge} transparent opacity={0.3} depthWrite={false} />
      </lineSegments>
      <primitive object={axisLine} />
    </group>
  );
}

function Particles({ model, theme, budget }: { model: UniverseModel; theme: ThemeDef; budget: number }) {
  const count = Math.round(theme.universe.particles * budget);
  const ref = useRef<THREE.Points>(null);
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const R = model.bounds.radius * 1.5 + 14;
    // Seeded: the same case always has the same dust, and renders are pure.
    const rnd = prng(`dust:${model.layout}:${model.nodes.length}`);
    for (let i = 0; i < count; i++) {
      const u = rnd() * 2 - 1;
      const th = rnd() * Math.PI * 2;
      const r = Math.cbrt(rnd()) * R;
      const s = Math.sqrt(1 - u * u);
      pos.set([model.bounds.center[0] + Math.cos(th) * s * r, model.bounds.center[1] + u * r * 0.8, model.bounds.center[2] + Math.sin(th) * s * r], i * 3);
    }
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return g;
  }, [count, model.bounds, model.layout, model.nodes.length]);
  useEffect(() => () => geo.dispose(), [geo]);
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += dt * 0.012;
  });
  if (!count) return null;
  return (
    <points ref={ref} geometry={geo} renderOrder={1}>
      <pointsMaterial size={theme.scheme === "light" ? 0.16 : 0.12} sizeAttenuation transparent opacity={theme.scheme === "light" ? 0.35 : 0.5} color={theme.universe.colors.edgeLive} depthWrite={false} blending={theme.scheme === "light" ? THREE.NormalBlending : THREE.AdditiveBlending} />
    </points>
  );
}

/* ─────────────────────────── ops: teams in the graph ─────────────────────────── */

function TeamPins({ model, pins, theme, paused }: { model: UniverseModel; pins: TeamPin[]; theme: ThemeDef; paused: boolean }) {
  const ref = useRef<THREE.Points>(null);
  const layout = useMemo(() => {
    const perNode = new Map<string, number>();
    return pins.map((p) => {
      const key = p.nodeId ?? "_";
      const k = perNode.get(key) ?? 0;
      perNode.set(key, k + 1);
      let h = 0;
      for (let i = 0; i < p.id.length; i++) h = (h * 31 + p.id.charCodeAt(i)) >>> 0;
      return { ...p, k, phase: (h % 1000) / 1000 };
    });
  }, [pins]);
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(Math.max(1, layout.length) * 3), 3));
    const col = new Float32Array(Math.max(1, layout.length) * 3);
    const C = theme.universe.colors;
    layout.forEach((p, i) => {
      const c = new THREE.Color(p.stuck ? C.suspicious : p.active ? C.edgeLive : C.discovered);
      col.set([c.r, c.g, c.b], i * 3);
    });
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    return g;
  }, [layout, theme]);
  useEffect(() => () => geo.dispose(), [geo]);
  useFrame((s) => {
    if (paused) return;
    const a = geo.attributes.position as THREE.BufferAttribute;
    const t = s.clock.elapsedTime;
    layout.forEach((p, i) => {
      const n = p.nodeId ? model.nodes[model.byId.get(p.nodeId) ?? -1] : undefined;
      if (!n) return a.setXYZ(i, 0, -9999, 0);
      const ang = p.phase * 6.283 + t * (p.stuck ? 0.25 : 0.7) * (1 + (p.k % 3) * 0.2);
      const r = n.radius * 1.9 + 0.55 * p.k;
      a.setXYZ(i, n.pos[0] + Math.cos(ang) * r, n.pos[1] + Math.sin(ang * 1.3) * r * 0.55, n.pos[2] + Math.sin(ang) * r);
    });
    a.needsUpdate = true;
  });
  if (!layout.length) return null;
  return (
    <points ref={ref} geometry={geo} renderOrder={6} frustumCulled={false}>
      <pointsMaterial size={0.55} sizeAttenuation vertexColors transparent depthWrite={false} blending={THREE.AdditiveBlending} />
    </points>
  );
}

/* ─────────────────────────── labels ─────────────────────────── */

/**
 * File tags are ordinary DOM (crisp type, real text for assistive tech). The
 * scene's only job is to say *where on the canvas* each tagged file currently
 * is; the stage moves the tags with a rAF loop. No React roots inside WebGL.
 */
export type LabelSink = React.MutableRefObject<Map<string, { x: number; y: number; on: boolean }>>;

function LabelProjector({ model, ids, sink, actSink }: { model: UniverseModel; ids: string[]; sink: LabelSink; actSink?: LabelSink }) {
  const { camera, size } = useThree();
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    sink.current.clear();
    for (const id of ids) {
      const n = model.nodes[model.byId.get(id) ?? -1];
      if (!n) continue;
      v.set(n.pos[0], n.pos[1] + n.radius * (model.layout === "wall" ? 2.15 : 1.9), n.pos[2]).project(camera);
      sink.current.set(id, { x: (v.x * 0.5 + 0.5) * size.width, y: (-v.y * 0.5 + 0.5) * size.height, on: v.z > 0 && v.z < 1 && Math.abs(v.x) < 1.08 && Math.abs(v.y) < 1.08 });
    }
    if (actSink) {
      actSink.current.clear();
      for (const a of model.acts) {
        if (!a.count) continue;
        v.set(...a.anchor).project(camera);
        actSink.current.set(a.id, { x: (v.x * 0.5 + 0.5) * size.width, y: (-v.y * 0.5 + 0.5) * size.height, on: v.z > 0 && v.z < 1 && Math.abs(v.x) < 1.02 && Math.abs(v.y) < 1.02 });
      }
    }
  });
  return null;
}

/* ─────────────────────────── pointer picking ─────────────────────────── */

function Picking({ model, onSelect, onHover, onHoverTeam, pins, onInteract }: Pick<SceneProps, "model" | "onSelect" | "onHover" | "onHoverTeam" | "pins"> & { onInteract: () => void }) {
  const { camera, gl, size } = useThree();
  const hover = useRef<string | null>(null);
  const down = useRef<{ x: number; y: number } | null>(null);

  const pick = useCallback(
    (cx: number, cy: number): string | null => {
      const rect = gl.domElement.getBoundingClientRect();
      const x = cx - rect.left;
      const y = cy - rect.top;
      let best: string | null = null;
      let bestD = Infinity;
      for (const n of model.nodes) {
        tmpA.set(...n.pos).project(camera);
        if (tmpA.z > 1) continue;
        const sx = (tmpA.x * 0.5 + 0.5) * size.width;
        const sy = (-tmpA.y * 0.5 + 0.5) * size.height;
        // Projected radius in pixels.
        tmpB.set(...n.pos);
        const dist = camera.position.distanceTo(tmpB);
        const fov = ((camera as THREE.PerspectiveCamera).fov * Math.PI) / 180;
        const px = ((n.radius * (n.shape === "box" || model.layout === "wall" ? 1.7 : 1.35)) / (2 * Math.tan(fov / 2) * dist)) * size.height;
        const r = Math.max(14, px * 1.15);
        const d = Math.hypot(sx - x, sy - y);
        if (d < r && d / r + tmpA.z * 0.05 < bestD) {
          bestD = d / r + tmpA.z * 0.05;
          best = n.id;
        }
      }
      return best;
    },
    [camera, gl, model, size],
  );

  useEffect(() => {
    const el = gl.domElement;
    const move = (e: PointerEvent) => {
      if (e.buttons) return;
      const id = pick(e.clientX, e.clientY);
      if (id !== hover.current) {
        hover.current = id;
        onHover(id);
        el.style.cursor = id ? "pointer" : "grab";
      }
    };
    const leave = () => {
      hover.current = null;
      onHover(null);
    };
    const pd = (e: PointerEvent) => {
      down.current = { x: e.clientX, y: e.clientY };
      onInteract();
    };
    const pu = (e: PointerEvent) => {
      const d = down.current;
      down.current = null;
      if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) return;
      const id = pick(e.clientX, e.clientY);
      onSelect(id);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerleave", leave);
    el.addEventListener("pointerdown", pd);
    el.addEventListener("pointerup", pu);
    el.style.cursor = "grab";
    return () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerleave", leave);
      el.removeEventListener("pointerdown", pd);
      el.removeEventListener("pointerup", pu);
    };
  }, [gl, pick, onHover, onSelect, onInteract]);
  void pins;
  void onHoverTeam;
  return null;
}

function ViewShift({ px }: { px: number }) {
  const { camera, size } = useThree();
  useEffect(() => {
    const c = camera as THREE.PerspectiveCamera;
    if (px) c.setViewOffset(size.width, size.height, -px, 0, size.width, size.height);
    else c.clearViewOffset();
    c.updateProjectionMatrix();
    return () => {
      c.clearViewOffset();
      c.updateProjectionMatrix();
    };
  }, [camera, size, px]);
  return null;
}

/* ─────────────────────────── parallax ─────────────────────────── */

function Parallax({ drift, paused, children }: { drift: number; paused: boolean; children: React.ReactNode }) {
  const g = useRef<THREE.Group>(null);
  useFrame((s) => {
    if (paused || !g.current) return;
    const t = s.clock.elapsedTime;
    const tx = s.pointer.x * 0.045 * drift;
    const ty = s.pointer.y * 0.03 * drift;
    g.current.rotation.y += (tx + Math.sin(t * 0.15) * 0.012 * drift - g.current.rotation.y) * 0.04;
    g.current.rotation.x += (-ty + Math.cos(t * 0.11) * 0.008 * drift - g.current.rotation.x) * 0.04;
  });
  return <group ref={g}>{children}</group>;
}

/* ─────────────────────────── scene root ─────────────────────────── */

function Contents(p: SceneProps & { controlsRef: React.RefObject<OrbitControlsImpl | null>; onInteract: () => void; quiet: boolean }) {
  const { model, theme, mode, tier, posture, paused } = p;
  const budget = sceneBudget(tier);
  const u = theme.universe;
  const currentAct = model.acts.filter((a) => a.started).at(-1)?.index ?? 0;
  const { gl } = useThree();
  useEffect(() => {
    p.onReady?.();
    const el = gl.domElement;
    const lost = (e: Event) => {
      e.preventDefault();
      p.onFail?.();
    };
    el.addEventListener("webglcontextlost", lost);
    return () => el.removeEventListener("webglcontextlost", lost);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl]);
  return (
    <>
      <color attach="background" args={[u.colors.backdrop]} />
      {u.backdrop === "grid-void" ? <GridVoid model={model} theme={theme} paused={paused} current={currentAct} /> : null}
      {u.backdrop === "nebula" ? <Nebula theme={theme} paused={paused} /> : null}
      {u.backdrop === "wall" ? <Wall model={model} theme={theme} /> : null}
      {u.backdrop === "spectrum" ? <Spectrum model={model} theme={theme} paused={paused} /> : null}
      <ViewShift px={p.viewShift ?? 0} />
      <CameraRig model={model} theme={theme} posture={posture} selectedId={p.selectedId} fly={p.fly} intro={p.intro} controlsRef={p.controlsRef} onInteract={p.onInteract} quiet={p.quiet} shift={p.viewShift ?? 0} />
      <Parallax drift={p.quiet ? 0 : u.drift} paused={paused}>
        <Particles model={model} theme={theme} budget={budget.particles} />
        {model.layout === "wall" ? <ActStrips model={model} /> : null}
        <Edges model={model} theme={theme} paused={paused} path={p.path} mode={mode} reveal={p.reveal} revealRef={p.revealRef} />
        <Nodes model={model} theme={theme} mode={mode} selectedId={p.selectedId} hoveredId={p.hoveredId} path={p.path} pulses={p.pulses} reveal={p.reveal} revealRef={p.revealRef} intro={p.intro} fingerprint={p.fingerprint} pins={p.pins} paused={paused} tier={tier} />
        {p.pins?.length ? <TeamPins model={model} pins={p.pins} theme={theme} paused={paused} /> : null}
      </Parallax>
      <LabelProjector model={model} ids={p.labelIds} sink={p.labelSink} actSink={p.actSink} />
      <Picking model={model} onSelect={p.onSelect} onHover={p.onHover} onHoverTeam={p.onHoverTeam} pins={p.pins} onInteract={p.onInteract} />
      {budget.post ? (
        <Suspense fallback={null}>
          <Post theme={theme} tier={tier} />
        </Suspense>
      ) : null}
    </>
  );
}

export default function UniverseScene(props: SceneProps) {
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const lastInteract = useRef(0);
  const onInteract = useCallback(() => void (lastInteract.current = performance.now()), []);
  const budget = sceneBudget(props.tier);
  const u = props.theme.universe;
  const quiet = props.tier === "low" && props.mode === "player" ? false : false;
  return (
    <Canvas
      dpr={budget.dpr}
      frameloop={props.paused ? "never" : props.hold ? "demand" : "always"}
      flat
      gl={{ antialias: budget.antialias, alpha: false, powerPreference: "high-performance", stencil: false, depth: true }}
      camera={{ fov: u.fov, near: 0.5, far: 600, position: [0, 0, 40] }}
      onPointerMissed={() => undefined}
      style={{ touchAction: "none" }}
    >
      <Contents {...props} controlsRef={controlsRef} onInteract={onInteract} quiet={quiet} />
    </Canvas>
  );
}
