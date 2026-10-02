"use client";

import { Bloom, ChromaticAberration, EffectComposer, Noise, Vignette } from "@react-three/postprocessing";
import { BlendFunction } from "postprocessing";
import * as THREE from "three";

import type { Tier } from "@/components/experience/motion";
import type { ThemeDef } from "@/lib/experience/themes";

/** The look of the universe's light: bloom, vignette, grain, and (Signal) a hint of chromatic aberration. Budgeted by tier. */
export default function Post({ theme, tier }: { theme: ThemeDef; tier: Tier }) {
  const u = theme.universe;
  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      <>
        {u.bloom > 0 ? <Bloom intensity={u.bloom * (tier === "high" ? 1 : 0.7)} luminanceThreshold={0.42} luminanceSmoothing={0.35} mipmapBlur radius={0.7} /> : <></>}
        <Vignette eskil={false} offset={0.28} darkness={u.vignette} />
        {u.grain > 0 ? <Noise premultiply blendFunction={BlendFunction.SOFT_LIGHT} opacity={u.grain * 4} /> : <></>}
        {theme.id === "signal" && tier === "high" ? <ChromaticAberration offset={new THREE.Vector2(0.0009, 0.0006)} radialModulation={false} modulationOffset={0} /> : <></>}
      </>
    </EffectComposer>
  );
}
