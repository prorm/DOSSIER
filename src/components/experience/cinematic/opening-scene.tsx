"use client";

/* eslint-disable react-hooks/immutability -- three.js uniforms and scene objects are updated from the frame loop, outside React's render. */

import { Canvas, useFrame } from "@react-three/fiber";
import { Bloom, EffectComposer, Vignette } from "@react-three/postprocessing";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import type { Formation, ThemeDef } from "@/lib/experience/themes";
import { prng } from "@/lib/experience/variation";

/** Mutable state GSAP drives and the scene reads every frame (no React renders per frame). */
export interface OpeningState {
  progress: number;
  flash: number;
  exit: number;
}

const VERT = /* glsl */ `
attribute vec3 aStart;
attribute vec3 aTarget;
attribute vec4 aRand;   // x delay, y spin, z size, w held
attribute float aAng;   // final orientation about Z
uniform float uProgress;
uniform float uTime;
uniform float uExit;
uniform vec3 uHeld;
uniform vec3 uSealed;
varying vec3 vCol;
varying float vHeld;
varying vec2 vUv;
mat3 rot(vec3 a, float t) {
  float c = cos(t), s = sin(t); float x = a.x, y = a.y, z = a.z; float oc = 1.0 - c;
  return mat3(oc*x*x + c, oc*x*y + z*s, oc*z*x - y*s,
              oc*x*y - z*s, oc*y*y + c, oc*y*z + x*s,
              oc*z*x + y*s, oc*y*z - x*s, oc*z*z + c);
}
void main() {
  float d = aRand.x * 0.5;
  float p = clamp((uProgress - d) / 0.5, 0.0, 1.0);
  float e = p * p * (3.0 - 2.0 * p);
  vec3 wob = vec3(sin(uTime * 1.3 + aRand.y * 9.0), cos(uTime * 1.1 + aRand.y * 7.0), sin(uTime * 0.9 + aRand.y * 5.0)) * (1.0 - e) * 0.9;
  float idle = e * 0.05 * sin(uTime * 1.7 + aRand.y * 12.0);
  vec3 c = mix(aStart, aTarget, e) + wob + vec3(0.0, idle, 0.0);
  // Exit: everything rushes toward the camera.
  c += normalize(aTarget + vec3(0.0001)) * uExit * 26.0;
  vec3 axis = normalize(vec3(aRand.y - 0.5, 0.6, aRand.x - 0.3));
  float spin = (uTime * (0.6 + aRand.y * 1.6) + aRand.y * 6.28) * (1.0 - e);
  float ca = cos(aAng * e), sa = sin(aAng * e);
  vec3 lp = position * aRand.z * (0.5 + 0.5 * e);
  lp = vec3(ca * lp.x - sa * lp.y, sa * lp.x + ca * lp.y, lp.z);
  lp = rot(axis, spin) * lp;
  vec4 mv = viewMatrix * vec4(c + lp, 1.0);
  gl_Position = projectionMatrix * mv;
  vHeld = aRand.w;
  vCol = mix(uSealed, uHeld, aRand.w);
  vUv = position.xy;
}
`;

const FRAG = /* glsl */ `
uniform float uFlash;
uniform float uProgress;
varying vec3 vCol;
varying float vHeld;
varying vec2 vUv;
void main() {
  // Facet shading: a bright leading edge fading toward the tail.
  float g = 0.55 + 0.6 * smoothstep(-0.7, 0.8, vUv.y);
  vec3 col = vCol * g * (0.4 + 0.6 * vHeld) + vec3(uFlash * 0.8);
  float a = (0.28 + 0.62 * vHeld) * (0.55 + 0.45 * smoothstep(0.0, 0.5, uProgress));
  gl_FragColor = vec4(col, clamp(a + uFlash * 0.3, 0.0, 1.0));
}
`;

/** Where each shard ends up — and how it lies there. The formation is a data choice (see themes.formation). */
function targets(kind: Formation, n: number, r: () => number): { pos: Float32Array; ang: Float32Array } {
  const pos = new Float32Array(n * 3);
  const ang = new Float32Array(n);
  const put = (i: number, x: number, y: number, z: number, a = 0) => {
    pos.set([x, y, z], i * 3);
    ang[i] = a;
  };
  for (let i = 0; i < n; i++) {
    const t = i / n;
    if (kind === "orb") {
      const y = 1 - (2 * (i + 0.5)) / n;
      const rad = Math.sqrt(1 - y * y);
      const th = Math.PI * (3 - Math.sqrt(5)) * i;
      const R = 3.6 + (r() - 0.5) * 0.35;
      put(i, Math.cos(th) * rad * R, y * R, Math.sin(th) * rad * R, th);
    } else if (kind === "folder") {
      // Loose sheets squaring up into a document, slightly rotated like a real stack.
      const cols = 9;
      const c = i % cols;
      const row = Math.floor(i / cols);
      const rows = Math.ceil(n / cols);
      put(i, (c / (cols - 1) - 0.5) * 5.8 + (r() - 0.5) * 0.1, (0.5 - row / Math.max(1, rows - 1)) * 7.4 + (r() - 0.5) * 0.1, (r() - 0.5) * 0.4, (r() - 0.5) * 0.35);
    } else if (kind === "spectrum") {
      const bars = 30;
      const b = i % bars;
      const h = 0.25 + 0.75 * Math.abs(Math.sin(b * 0.55) * Math.cos(b * 0.21 + 1.3));
      const seg = Math.floor(i / bars);
      put(i, (b / (bars - 1) - 0.5) * 12.5, -2.6 + seg * 0.3 * (0.6 + h), (r() - 0.5) * 0.3, 0);
    } else {
      // seal: two rings whose tiles lie along the circumference, tick marks and a diamond core
      if (t < 0.5) {
        const a = (i / (n * 0.5)) * Math.PI * 2;
        put(i, Math.cos(a) * 4.4, Math.sin(a) * 4.4, 0, a + Math.PI / 2);
      } else if (t < 0.78) {
        const a = ((i - n * 0.5) / (n * 0.28)) * Math.PI * 2;
        put(i, Math.cos(a) * 3.2, Math.sin(a) * 3.2, 0.2, a + Math.PI / 2);
      } else {
        const a = ((i - n * 0.78) / (n * 0.22)) * Math.PI * 2;
        const s = 1.35;
        put(i, Math.sign(Math.cos(a)) * Math.pow(Math.abs(Math.cos(a)), 1.4) * s, Math.sign(Math.sin(a)) * Math.pow(Math.abs(Math.sin(a)), 1.4) * s, 0.4, a);
      }
    }
  }
  return { pos, ang };
}

function Shards({ state, theme, total, held, formation, tier }: { state: React.RefObject<OpeningState>; theme: ThemeDef; total: number; held: number; formation: Formation; tier: string }) {
  const count = tier === "low" ? Math.min(total, 90) : total;
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthWrite: false,
        blending: theme.scheme === "light" ? THREE.NormalBlending : THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        uniforms: {
          uProgress: { value: 0 },
          uTime: { value: 0 },
          uExit: { value: 0 },
          uFlash: { value: 0 },
          // On paper the evidence you hold is the darker, inked sheet; the sealed pages are still pale.
          uHeld: { value: new THREE.Color(theme.scheme === "light" ? "#8f7a52" : theme.universe.colors.available) },
          uSealed: { value: theme.scheme === "light" ? new THREE.Color("#f3ead2") : new THREE.Color(theme.universe.colors.locked).lerp(new THREE.Color(theme.brand), 0.25) },
        },
      }),
    [theme],
  );
  const geo = useMemo(() => {
    const r = prng(`open:${formation}:${count}`);
    const g = new THREE.InstancedBufferGeometry();
    // Glass slivers for seals and orbs; real sheets for the folder; bar segments for the spectrum.
    if (formation === "folder" || formation === "spectrum") {
      const base = formation === "folder" ? new THREE.PlaneGeometry(0.62, 0.8) : new THREE.PlaneGeometry(0.34, 0.2);
      g.index = base.index;
      g.setAttribute("position", base.attributes.position!);
    } else {
      const sx = 0.4;
      g.setAttribute("position", new THREE.BufferAttribute(new Float32Array([-sx, -0.5, 0, sx, -0.42, 0, sx * 0.25, 0.62, 0]), 3));
    }
    const start = new Float32Array(count * 3);
    const rand = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      const u = r() * 2 - 1;
      const th = r() * Math.PI * 2;
      const R = 14 + r() * 16;
      const s = Math.sqrt(1 - u * u);
      start.set([Math.cos(th) * s * R, u * R * 0.7, Math.sin(th) * s * R - 4], i * 3);
      rand.set([r(), r(), (formation === "folder" || formation === "spectrum" ? 1 : 0.5) + r() * 0.3, i < (held / Math.max(1, total)) * count ? 1 : 0], i * 4);
    }
    const t = targets(formation, count, r);
    g.setAttribute("aStart", new THREE.InstancedBufferAttribute(start, 3));
    g.setAttribute("aTarget", new THREE.InstancedBufferAttribute(t.pos, 3));
    g.setAttribute("aAng", new THREE.InstancedBufferAttribute(t.ang, 1));
    g.setAttribute("aRand", new THREE.InstancedBufferAttribute(rand, 4));
    g.instanceCount = count;
    return g;
  }, [count, formation, held, total]);
  useEffect(() => () => void (mat.dispose(), geo.dispose()), [mat, geo]);
  const group = useRef<THREE.Group>(null);
  useFrame((s) => {
    const st = state.current;
    if (!st) return;
    mat.uniforms.uProgress!.value = st.progress;
    mat.uniforms.uTime!.value = s.clock.elapsedTime;
    mat.uniforms.uFlash!.value = st.flash;
    mat.uniforms.uExit!.value = st.exit;
    if (group.current) {
      group.current.rotation.y = Math.sin(s.clock.elapsedTime * 0.25) * 0.28 * (formation === "orb" ? 2.2 : 1);
      group.current.rotation.z = formation === "seal" ? s.clock.elapsedTime * 0.06 * st.progress : 0;
    }
    s.camera.position.z = 15 - st.progress * 2.2 - st.exit * 6;
  });
  return (
    <group ref={group}>
      <mesh geometry={geo} material={mat} frustumCulled={false} />
    </group>
  );
}

export default function OpeningScene({ state, theme, total, held, formation, tier }: { state: React.RefObject<OpeningState>; theme: ThemeDef; total: number; held: number; formation: Formation; tier: string }) {
  return (
    <Canvas dpr={tier === "low" ? 1 : [1, 1.5]} flat gl={{ antialias: false, alpha: false, powerPreference: "high-performance" }} camera={{ fov: 42, position: [0, 0, 15], near: 0.1, far: 200 }}>
      <color attach="background" args={[theme.palette.bg]} />
      <Shards state={state} theme={theme} total={total} held={held} formation={formation} tier={tier} />
      {tier !== "low" ? (
        <EffectComposer multisampling={0} enableNormalPass={false}>
          <>
            {theme.universe.bloom > 0 ? <Bloom intensity={theme.universe.bloom * 0.7} luminanceThreshold={0.5} mipmapBlur radius={0.6} /> : <></>}
            <Vignette offset={0.25} darkness={theme.universe.vignette} />
          </>
        </EffectComposer>
      ) : null}
    </Canvas>
  );
}
