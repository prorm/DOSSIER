"use client";

import { ArrowRight, FastForward } from "lucide-react";
import gsap from "gsap";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { playCue } from "@/components/experience/sound";
import { useMaybeUniverse } from "@/components/experience/universe/universe-stage";
import type { CinematicVars, ResolvedScript } from "@/lib/experience/cinematic";
import type { ThemeDef } from "@/lib/experience/themes";
import { teamDressing } from "@/lib/experience/variation";
import { cn } from "@/lib/utils";
import type { OpeningState } from "./opening-scene";

const OpeningScene = dynamic(() => import("./opening-scene"), { ssr: false });

/**
 * Interprets a resolved script. A GSAP master timeline drives two things:
 * the DOM (log lines, title treatment, call to action) through React state,
 * and a plain mutable object the WebGL scene reads each frame. Skip, fast
 * forward and reduced motion are first-class: they set the *end state*
 * directly instead of trying to seek through animation.
 */
export default function OpeningPlayer({
  script,
  theme,
  cta,
  vars,
  canScene,
  tier,
  onDone,
}: {
  script: ResolvedScript;
  theme: ThemeDef;
  cta: string;
  vars: CinematicVars;
  canScene: boolean;
  tier: string;
  onDone: () => void;
}) {
  const universe = useMaybeUniverse();
  const dress = useMemo(() => teamDressing(vars.fingerprint), [vars.fingerprint]);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const state = useRef<OpeningState>({ progress: 0, flash: 0, exit: 0 });
  const tl = useRef<gsap.core.Timeline | null>(null);
  const [lines, setLines] = useState(0);
  const [titleOn, setTitleOn] = useState(false);
  const [kickerOn, setKickerOn] = useState(false);
  const [ctaOn, setCtaOn] = useState(false);
  const [typed, setTyped] = useState(0);
  const [flash, setFlash] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const done = useRef(false);

  const log = script.beats.find((b) => b.kind === "log");
  const logLines = log && log.kind === "log" ? log.lines : [];
  const { caseNumber, title, kicker, label, treatment } = script.title;
  const typedFull = caseNumber.length + title.length;
  const scene = canScene && script.mode !== "reduced";

  // While the opening plays, the universe underneath holds its arrival animation.
  useEffect(() => {
    universe?.holdIntro(true);
    return () => universe?.holdIntro(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const leave = useCallback(() => {
    if (done.current) return;
    done.current = true;
    tl.current?.kill();
    setLeaving(true);
    universe?.holdIntro(false);
    playCue("confirm", theme.sound);
    gsap.to(state.current, { exit: 1, duration: 0.7, ease: "power2.in" });
    gsap.to(root.current, { opacity: 0, duration: 0.55, delay: 0.15, ease: "power2.inOut", onComplete: onDone });
  }, [onDone, theme, universe]);

  const finalState = useCallback(() => {
    tl.current?.kill();
    setLines(logLines.length);
    setTitleOn(true);
    setKickerOn(true);
    setTyped(typedFull);
    state.current.progress = 1;
    state.current.flash = 0;
    setFlash(0);
    setCtaOn(script.mode === "first" || script.mode === "reduced");
  }, [logLines.length, script.mode, typedFull]);

  useEffect(() => {
    if (script.mode === "reduced") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- the reduced opening IS its end state: set it once, no timeline
      finalState();
      return;
    }
    const master = gsap.timeline();
    tl.current = master;
    const typedObj = { n: 0 };
    const flashObj = { v: 0 };
    for (const b of script.beats) {
      switch (b.kind) {
        case "log":
          b.lines.forEach((_, i) => master.call(() => setLines(i + 1), undefined, b.at + i * b.interval));
          break;
        case "shards":
          master.to(state.current, { progress: 1, duration: b.duration, ease: "power2.inOut" }, b.at);
          break;
        case "title":
          master.call(() => setTitleOn(true), undefined, b.at);
          if (b.treatment === "type") master.to(typedObj, { n: typedFull, duration: Math.max(0.9, b.duration * 1.6), ease: "none", onUpdate: () => setTyped(Math.floor(typedObj.n)) }, b.at);
          break;
        case "kicker":
          master.call(() => setKickerOn(true), undefined, b.at);
          break;
        case "flash":
          // immediateRender:false — otherwise the "from" value is applied at build time and the screen starts washed out.
          master.fromTo(state.current, { flash: b.strength }, { flash: 0, duration: 0.8, ease: "power3.out", immediateRender: false }, b.at);
          master.fromTo(flashObj, { v: b.strength }, { v: 0, duration: 0.8, ease: "power3.out", immediateRender: false, onUpdate: () => setFlash(flashObj.v) }, b.at);
          break;
        case "sound":
          master.call(() => playCue(b.cue, theme.sound), undefined, b.at);
          break;
        case "cta":
          master.call(() => setCtaOn(true), undefined, b.at);
          break;
      }
    }
    if (script.autoEnter) master.call(() => leave(), undefined, script.autoEnter);
    return () => void master.kill();
    // The script is fixed for the lifetime of this player.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (ctaOn) button.current?.focus({ preventScroll: true });
  }, [ctaOn]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return leave();
      // A modal: Tab cycles through the opening's own controls (Skip, the way in) and never reaches the page behind it.
      if (e.key === "Tab") {
        const els = [...(root.current?.querySelectorAll<HTMLElement>("button:not([tabindex='-1'])") ?? [])];
        e.preventDefault();
        if (!els.length) return;
        const i = els.indexOf(document.activeElement as HTMLElement);
        els[(i + (e.shiftKey ? -1 : 1) + els.length) % els.length]!.focus();
        return;
      }
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (ctaOn || script.mode === "returning") leave();
        else finalState();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ctaOn, finalState, leave, script.mode]);

  const caseTyped = treatment === "type" ? caseNumber.slice(0, typed) : caseNumber;
  const nameTyped = treatment === "type" ? title.slice(0, Math.max(0, typed - caseNumber.length)) : title;
  const typing = treatment === "type" && titleOn && typed < typedFull;

  return (
    <div
      ref={root}
      className={cn("opening", `theme-${theme.id}`, leaving && "is-leaving")}
      role="dialog"
      aria-modal="true"
      aria-label={`${caseNumber}: ${title}`}
      data-testid="opening"
      data-mode={script.mode}
      onPointerDown={() => (script.mode === "returning" ? leave() : undefined)}
    >
      {scene ? (
        <div className="opening-scene" aria-hidden="true">
          <OpeningScene state={state} theme={theme} total={script.shards.total} held={script.shards.held} formation={script.formation} tier={tier} />
        </div>
      ) : (
        <div className="opening-void" aria-hidden="true" />
      )}
      <div className="opening-flash" style={{ opacity: flash * 0.5 }} aria-hidden="true" />

      <div className="opening-head">
        <span className="font-display">
          {vars.eventName.length > 42 ? vars.eventName.slice(0, 40) + "…" : vars.eventName} <span className="opacity-40">{"//"}</span> {dress.dossierNo}
        </span>
        {script.mode !== "reduced" ? (
          <button type="button" onClick={leave} className="opening-skip">
            Skip <FastForward className="size-3.5" aria-hidden="true" />
          </button>
        ) : null}
      </div>

      <ul className="opening-log" aria-hidden={script.mode === "reduced"}>
        {logLines.slice(0, lines).map((l, i) => (
          <li key={i} className={`tone-${l.tone ?? "ok"}`}>
            <span>{l.text}</span>
            {l.status ? <em>{l.status}</em> : null}
          </li>
        ))}
        {script.mode === "first" && lines < logLines.length ? <li className="opening-cursor">▌</li> : null}
      </ul>

      <div className={cn("opening-title", `t-${treatment}`, titleOn && "is-on")}>
        <p className="opening-label">{label}</p>
        <h1 className="opening-case">
          <span>{caseTyped || " "}</span>
          {typing && typed <= caseNumber.length ? <i className="opening-caret" /> : null}
        </h1>
        <p className="opening-name">
          <span>{nameTyped || " "}</span>
          {typing && typed > caseNumber.length ? <i className="opening-caret" /> : null}
        </p>
        <p className={cn("opening-kicker", kickerOn && "is-on")}>{kicker}</p>
      </div>

      <div className={cn("opening-cta", ctaOn && "is-on")}>
        <button ref={button} type="button" onClick={leave} className="u-cta" tabIndex={ctaOn ? 0 : -1}>
          {cta} <ArrowRight className="size-4" aria-hidden="true" />
        </button>
        <p>
          {script.mode === "reduced" ? "Motion is reduced on this device." : "Press Enter"}
        </p>
      </div>
    </div>
  );
}
