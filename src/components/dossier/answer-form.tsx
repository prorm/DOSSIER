"use client";

import { ArrowRight, CircleSlash, Droplet, FolderOpen, Sparkles, Timer, WifiOff } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import CountUp from "@/components/reactbits/CountUp";
import DecryptedText from "@/components/reactbits/DecryptedText";
import GlitchText from "@/components/reactbits/GlitchText";
import LatticeLoader from "@/components/reactbits/LatticeLoader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, ApiError, formatDuration } from "@/lib/api";
import { nodeHref } from "@/lib/modes";
import { cn } from "@/lib/utils";

/** What the engine returns for every action (see server/game/engine.ts DispatchResult). */
export interface ActionResult {
  feedback: { tone: "success" | "fail" | "info" | "partial"; title: string; message?: string; data?: Record<string, unknown> };
  correct: boolean | null;
  solved: boolean;
  unlocked: { id: string; title: string }[];
  evidence: { id: string; title: string }[];
  discoveries: string[];
  pointsDelta: number;
  firstBlood: boolean;
  retryAfterMs: number;
  freeAttemptsLeft: number | null;
}

export type UiState =
  | { kind: "idle" }
  | { kind: "pending" }
  | { kind: "result"; result: ActionResult; seq: number }
  | { kind: "cooldown"; until: number; message: string }
  | { kind: "error"; message: string; offline?: boolean };

/**
 * One hook for every primitive: sends an action to the engine, tracks
 * cooldowns and refreshes server components once the moment has landed.
 */
export function useNodeAction(nodeId: string) {
  const router = useRouter();
  const [ui, setUi] = useState<UiState>({ kind: "idle" });
  const [now, setNow] = useState(() => Date.now());
  const seq = useRef(0);
  const cooling = ui.kind === "cooldown" && ui.until > now;

  useEffect(() => {
    if (ui.kind !== "cooldown") return;
    const until = ui.until;
    const t = setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (n >= until) {
        clearInterval(t);
        setUi({ kind: "idle" });
      }
    }, 250);
    return () => clearInterval(t);
  }, [ui]);

  const run = useCallback(
    async (action: Record<string, unknown>): Promise<ActionResult | null> => {
      setUi({ kind: "pending" });
      try {
        const r = await api<ActionResult>("/api/play/action", { body: { nodeId, action } });
        seq.current += 1;
        if (r.correct === false && r.retryAfterMs > 0) {
          setNow(Date.now());
          setUi({ kind: "cooldown", until: Date.now() + r.retryAfterMs, message: r.feedback.message ?? "Incorrect. Cooldown engaged." });
        } else setUi({ kind: "result", result: r, seq: seq.current });
        // Let the moment land, then pull fresh server state (unlocks, evidence, HUD).
        setTimeout(() => router.refresh(), r.solved ? 1400 : 300);
        return r;
      } catch (err) {
        const e = err instanceof ApiError ? err : new ApiError("unknown", "Something went wrong.", 0);
        if (e.code === "rate_limited") {
          setNow(Date.now());
          setUi({ kind: "cooldown", until: Date.now() + Math.max(1000, e.retryAfterMs), message: e.message });
        } else {
          if (e.code === "already_solved") router.refresh();
          setUi({ kind: "error", message: e.message, offline: e.code === "offline" });
        }
        return null;
      }
    },
    [nodeId, router],
  );

  return { ui, setUi, run, cooling, now };
}

/** The consequence of an action: granted / denied / partial, and what it changed in the world. */
export function Outcome({ ui, now, className }: { ui: UiState; now: number; className?: string }) {
  if (ui.kind === "pending") return <p className={cn("font-mono text-[0.78rem] text-mute", className)}>Transmitting…</p>;
  if (ui.kind === "cooldown")
    return (
      <p className={cn("flex items-center gap-2 font-mono text-[0.78rem] text-signal-amber", className)}>
        <Timer className="size-4" aria-hidden="true" /> {ui.message} {ui.until > now ? `Retry in ${formatDuration(ui.until - now)}.` : ""}
      </p>
    );
  if (ui.kind === "error")
    return (
      <p className={cn("flex items-center gap-2 font-mono text-[0.78rem]", ui.offline ? "text-signal-amber" : "text-signal-magenta", className)}>
        {ui.offline ? <WifiOff className="size-4" aria-hidden="true" /> : <CircleSlash className="size-4" aria-hidden="true" />} {ui.message}
      </p>
    );
  if (ui.kind !== "result") return null;
  const r = ui.result;
  const f = r.feedback;
  if (r.solved) {
    return (
      <div className={cn("panel animate-scan-once overflow-hidden border-[color-mix(in_srgb,var(--color-signal-green)_45%,var(--color-line))] p-4 sm:p-5", className)} role="status" aria-live="polite">
        <p className="label-mono !text-signal-green">{"// verified"}</p>
        <p className="mt-1 font-mono text-2xl font-bold tracking-[0.08em] text-signal-green text-glow sm:text-3xl">
          <DecryptedText text={f.title} animateOn="mount" sequential speed={32} encryptedClassName="text-signal-green/50" />
        </p>
        {f.message ? <p className="mt-2 text-sm text-ink-dim">{f.message}</p> : null}
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-sm">
          {r.pointsDelta ? (
            <span className="text-ink">
              <CountUp to={r.pointsDelta} from={0} signed className="text-lg font-semibold text-signal-green" /> <span className="text-mute">points</span>
            </span>
          ) : null}
          {r.firstBlood ? (
            <span className="inline-flex items-center gap-1.5 text-signal-magenta">
              <Droplet className="size-4" aria-hidden="true" /> First blood
            </span>
          ) : null}
        </div>
        <WorldChanges r={r} />
      </div>
    );
  }
  const tone = f.tone === "fail" ? "text-signal-magenta" : f.tone === "partial" ? "text-signal-amber" : "text-signal-cyan";
  return (
    <div className={cn("space-y-2 font-mono text-[0.8rem]", className)} role="status" aria-live="polite">
      <p className={cn("flex flex-wrap items-center gap-x-3 gap-y-1", tone)}>
        {f.tone === "fail" ? (
          <GlitchText burst burstKey={ui.seq} className="font-bold tracking-[0.12em]" as="span">
            {f.title}
          </GlitchText>
        ) : (
          <span className="font-bold tracking-[0.12em]">{f.title}</span>
        )}
        {r.correct === false && r.freeAttemptsLeft !== null ? (
          <span className="text-ink-dim">{r.freeAttemptsLeft > 0 ? `${r.freeAttemptsLeft} more ${r.freeAttemptsLeft === 1 ? "miss" : "misses"} before a cooldown.` : "Next miss starts a cooldown."}</span>
        ) : null}
        {r.pointsDelta ? <span className={r.pointsDelta > 0 ? "text-signal-green" : "text-signal-magenta"}>{r.pointsDelta > 0 ? `+${r.pointsDelta}` : r.pointsDelta} pts</span> : null}
      </p>
      {f.message ? <p className="whitespace-pre-wrap font-sans text-sm text-ink-dim">{f.message}</p> : null}
      <WorldChanges r={r} />
    </div>
  );
}

function WorldChanges({ r }: { r: ActionResult }) {
  if (!r.unlocked.length && !r.evidence.length && !r.discoveries.length) return null;
  return (
    <div className="mt-3 border-t border-line pt-3">
      <p className="label-mono mb-2 flex items-center gap-1.5">
        <Sparkles className="size-3" aria-hidden="true" /> What changed
      </p>
      <ul className="flex flex-wrap gap-2">
        {r.unlocked.map((u) => (
          <li key={u.id}>
            <Link href={nodeHref(u.id)} className="inline-flex items-center gap-1 rounded-xs border border-[color-mix(in_srgb,var(--accent)_45%,transparent)] px-2 py-1 font-mono text-xs text-signal hover:bg-raised">
              unlocked: {u.title} <ArrowRight className="size-3" aria-hidden="true" />
            </Link>
          </li>
        ))}
        {r.evidence.map((e) => (
          <li key={e.id}>
            <Link href={`/play/case/evidence/${e.id}`} className="inline-flex items-center gap-1 rounded-xs border border-[color-mix(in_srgb,var(--accent-2)_45%,transparent)] px-2 py-1 font-mono text-xs text-signal-2 hover:bg-raised">
              <FolderOpen className="size-3" aria-hidden="true" /> {e.title}
            </Link>
          </li>
        ))}
        {r.discoveries.map((d) => (
          <li key={d} className="rounded-xs border border-line px-2 py-1 font-mono text-xs text-ink-dim">
            {d}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The answer console. Feedback is a *moment* — granted decrypts in, denied
 * glitches — but every state is also spelled out in text (live region).
 */
export function AnswerForm({
  nodeId,
  answerType = "text",
  disabledReason,
  label = "Submit answer",
  hint,
  placeholder,
}: {
  nodeId: string;
  answerType?: "text" | "flag" | "number";
  disabledReason?: string | null;
  label?: string;
  hint?: string;
  placeholder?: string;
}) {
  const [value, setValue] = useState("");
  const { ui, run, cooling, now } = useNodeAction(nodeId);
  const inputRef = useRef<HTMLInputElement>(null);
  const fid = useId();
  // Workstations can hand a value to the answer console (the decoding desk's "Send to answer").
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ nodeId?: string; value?: string }>).detail;
      if (d?.nodeId === nodeId && typeof d.value === "string") {
        setValue(d.value.slice(0, 300));
        inputRef.current?.focus();
      }
    };
    window.addEventListener("dossier:fill", on);
    return () => window.removeEventListener("dossier:fill", on);
  }, [nodeId]);
  const pending = ui.kind === "pending";
  const solved = ui.kind === "result" && ui.result.solved;
  const denied = ui.kind === "result" && ui.result.correct === false;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!value.trim() || pending || cooling || disabledReason) return;
    const r = await run({ type: "answer", value });
    if (r?.solved) setValue("");
    else inputRef.current?.select();
  };

  if (solved) return <Outcome ui={ui} now={now} />;
  const isFlag = answerType === "flag";
  return (
    <form onSubmit={submit} className="panel relative p-4 sm:p-5" noValidate>
      <label htmlFor={fid} className="label-mono mb-2 flex items-center justify-between">
        <span>{label}</span>
        {hint ? <span className="text-faint normal-case tracking-normal">{hint}</span> : null}
      </label>
      <div className={cn("flex flex-col gap-2 sm:flex-row", denied && "animate-shake")} key={ui.kind === "result" ? ui.seq : "form"}>
        <div className="relative flex-1">
          <span aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 font-mono text-sm text-signal">
            &gt;
          </span>
          <Input
            ref={inputRef}
            id={fid}
            name="answer"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder ?? (isFlag ? "DOSSIER{...}" : answerType === "number" ? "0" : "your answer")}
            inputMode={answerType === "number" ? "decimal" : "text"}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            enterKeyHint="send"
            maxLength={300}
            disabled={Boolean(disabledReason)}
            aria-invalid={denied || undefined}
            aria-describedby={`${fid}-fb`}
            className="h-12 pl-7 text-base"
          />
        </div>
        <Button type="submit" size="lg" disabled={Boolean(disabledReason) || pending || cooling || !value.trim()} className="h-12 min-w-36">
          {pending ? (
            <LatticeLoader label="Verifying" status="working" grid={3} cellSize={4} gap={2} fontSize={11} color="var(--accent-ink)" showTimer={false} />
          ) : cooling ? (
            <>
              <Timer aria-hidden="true" /> {formatDuration((ui as { until: number }).until - now)}
            </>
          ) : (
            <>
              Transmit <ArrowRight aria-hidden="true" />
            </>
          )}
        </Button>
      </div>
      <div id={`${fid}-fb`} className="mt-3 min-h-6">
        {disabledReason ? (
          <p className="flex items-center gap-2 font-mono text-[0.78rem] text-signal-amber">
            <CircleSlash className="size-4" aria-hidden="true" /> {disabledReason}
          </p>
        ) : ui.kind === "idle" ? (
          <p className="font-mono text-[0.78rem] text-faint">{isFlag ? "Flags are case-sensitive." : "Case and spacing don't matter."}</p>
        ) : (
          <Outcome ui={ui} now={now} />
        )}
      </div>
    </form>
  );
}
