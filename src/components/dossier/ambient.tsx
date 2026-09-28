"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";
import { useCapableDevice, useEffectsEnabled } from "./effects";

const FaultyTerminal = dynamic(() => import("@/components/reactbits/FaultyTerminal"), { ssr: false });

// Stable prop identities: FaultyTerminal rebuilds its GL context when props change.
const GRID: [number, number] = [2, 1];

/**
 * The one ambient background (React Bits FaultyTerminal) — used on the landing
 * hero and the projector display only, never behind gameplay. Mounted only on
 * capable screens with effects allowed, unmounted when the tab is hidden, dimmed
 * and masked so type stays legible. Static grid fallback everywhere else.
 */
export function AmbientTerminal({ className, tint = "#39FF88", brightness = 0.55 }: { className?: string; tint?: string; brightness?: number }) {
  const effects = useEffectsEnabled();
  const capable = useCapableDevice(768);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const on = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, []);
  const run = effects && capable && visible;
  return (
    <div aria-hidden="true" className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}>
      <div className="grid-bg absolute inset-0 opacity-50" />
      {run ? (
        <div className="absolute inset-0 opacity-40 [mask-image:radial-gradient(75%_70%_at_50%_45%,#000_20%,transparent_80%)]">
          <FaultyTerminal
            scale={1.6}
            gridMul={GRID}
            digitSize={1.3}
            timeScale={0.35}
            scanlineIntensity={0.4}
            glitchAmount={0.6}
            flickerAmount={0.5}
            noiseAmp={0.8}
            chromaticAberration={0}
            dither={0}
            curvature={0.08}
            tint={tint}
            mouseReact={false}
            pageLoadAnimation
            brightness={brightness}
            dpr={1}
          />
        </div>
      ) : null}
      <div className="absolute inset-0 bg-[radial-gradient(70%_60%_at_50%_40%,transparent,var(--color-bg)_85%)]" />
    </div>
  );
}
