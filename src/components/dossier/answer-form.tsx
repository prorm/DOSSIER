"use client";

import { ArrowRight, CircleSlash, Droplet, Timer, WifiOff } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import CountUp from "@/components/reactbits/CountUp";
import DecryptedText from "@/components/reactbits/DecryptedText";
import GlitchText from "@/components/reactbits/GlitchText";
import LatticeLoader from "@/components/reactbits/LatticeLoader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, ApiError, formatDuration } from "@/lib/api";
import { challengeHref } from "@/lib/modes";
import { cn } from "@/lib/utils";

type Result =
  | { status: "correct"; points: number; firstBlood: boolean; unlocked: string[]; revealed: string[] }
  | { status: "incorrect"; retryAfterMs: number; freeAttemptsLeft: number };

type UiState =
  | { kind: "idle" }
  | { kind: "pending" }
  | { kind: "correct"; points: number; firstBlood: boolean; unlocked: string[]; revealed: string[] }
  | { kind: "incorrect"; attempt: number; freeLeft: number }
  | { kind: "cooldown"; until: number; message: string }
  | { kind: "error"; message: string; offline?: boolean };

/**
 * The submission console. Feedback is a *moment* — ACCESS GRANTED decrypts in,
 * ACCESS DENIED glitches for ~0.6s — but every state is also spelled out in
 * text (live region), so nothing depends on seeing the animation.
 */
export function AnswerForm({
  challengeId,
  answerType,
  disabledReason,
  modeLabel,
}: {
  challengeId: string;
  answerType: "text" | "flag" | "number";
  disabledReason?: string | null;
  modeLabel: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [ui, setUi] = useState<UiState>({ kind: "idle" });
  const [now, setNow] = useState(() => Date.now());
  const attempts = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const fid = useId();

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
        inputRef.current?.focus();
      }
    }, 250);
    return () => clearInterval(t);
  }, [ui]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!value.trim() || ui.kind === "pending" || cooling || disabledReason) return;
    setUi({ kind: "pending" });
    try {
      const r = await api<Result>("/api/play/submit", { body: { challengeId, answer: value } });
      if (r.status === "correct") {
        setUi({ kind: "correct", points: r.points, firstBlood: r.firstBlood, unlocked: r.unlocked, revealed: r.revealed });
        setValue("");
        // Let the moment land, then pull fresh server state (solved card, unlocked nodes, HUD).
        setTimeout(() => router.refresh(), 1400);
      } else {
        attempts.current += 1;
        if (r.retryAfterMs > 0) {
          setNow(Date.now());
          setUi({ kind: "cooldown", until: Date.now() + r.retryAfterMs, message: "Incorrect. Cooldown engaged — each further miss doubles it." });
        } else {
          setUi({ kind: "incorrect", attempt: attempts.current, freeLeft: r.freeAttemptsLeft });
        }
        inputRef.current?.select();
      }
    } catch (err) {
      const e2 = err instanceof ApiError ? err : new ApiError("unknown", "Something went wrong.", 0);
      if (e2.code === "rate_limited") {
        setNow(Date.now());
        setUi({ kind: "cooldown", until: Date.now() + Math.max(1000, e2.retryAfterMs), message: e2.message });
      } else if (e2.code === "already_solved") {
        router.refresh();
        setUi({ kind: "error", message: "Already solved by your team." });
      } else {
        setUi({ kind: "error", message: e2.message, offline: e2.code === "offline" });
      }
    }
  };

  if (ui.kind === "correct") {
    return (
      <div role="status" aria-live="assertive" className="panel glow relative overflow-hidden p-5 [--glow:var(--color-signal-green)]">
        <div aria-hidden="true" className="absolute inset-x-0 top-0 h-px animate-scan-once bg-signal-green" />
        <p className="label-mono !text-signal-green">{"// verified"}</p>
        <p className="mt-1 font-mono text-2xl font-bold tracking-[0.08em] text-signal-green text-glow sm:text-3xl">
          <DecryptedText text="ACCESS GRANTED" animateOn="mount" sequential speed={32} encryptedClassName="text-signal-green/50" />
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-sm">
          <span className="text-ink">
            <CountUp to={ui.points} from={0} signed className="text-lg font-semibold text-signal-green" /> <span className="text-mute">points</span>
          </span>
          {ui.firstBlood ? (
            <span className="inline-flex items-center gap-1.5 text-signal-magenta">
              <Droplet className="size-4" aria-hidden="true" /> First blood
            </span>
          ) : null}
        </div>
        {ui.unlocked.length || ui.revealed.length ? (
          <div className="mt-4 border-t border-line pt-3">
            <p className="label-mono mb-2">Unlocked</p>
            <ul className="flex flex-wrap gap-2">
              {ui.unlocked.map((id) => (
                <li key={id}>
                  <Link href={challengeHref(id)} className="inline-flex items-center gap-1 rounded-xs border border-[color-mix(in_srgb,var(--accent)_45%,transparent)] px-2 py-1 font-mono text-xs text-signal hover:bg-raised">
                    {id} <ArrowRight className="size-3" aria-hidden="true" />
                  </Link>
                </li>
              ))}
              {ui.revealed.map((id) => (
                <li key={id}>
                  <Link href={`/play/inquest/evidence/${id}`} className="inline-flex items-center gap-1 rounded-xs border border-[color-mix(in_srgb,var(--accent-2)_45%,transparent)] px-2 py-1 font-mono text-xs text-signal-2 hover:bg-raised">
                    evidence: {id} <ArrowRight className="size-3" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    );
  }

  const denied = ui.kind === "incorrect" || ui.kind === "cooldown";
  const disabled = Boolean(disabledReason) || ui.kind === "pending" || cooling;
  const isFlag = answerType === "flag";

  return (
    <form onSubmit={submit} className="panel relative p-4 sm:p-5" noValidate>
      <label htmlFor={fid} className="label-mono mb-2 flex items-center justify-between">
        <span>{isFlag ? "Submit flag" : answerType === "number" ? "Submit number" : "Submit answer"}</span>
        <span className="text-faint normal-case tracking-normal">{modeLabel}</span>
      </label>
      <div className={cn("flex flex-col gap-2 sm:flex-row", ui.kind === "incorrect" && "animate-shake")} key={ui.kind === "incorrect" ? ui.attempt : "form"}>
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
            placeholder={isFlag ? "DOSSIER{...}" : answerType === "number" ? "0" : "your answer"}
            inputMode={answerType === "number" ? "decimal" : "text"}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            enterKeyHint="send"
            maxLength={500}
            disabled={Boolean(disabledReason)}
            aria-invalid={denied || undefined}
            aria-describedby={`${fid}-fb`}
            className="h-12 pl-7 text-base"
          />
        </div>
        <Button type="submit" size="lg" disabled={disabled || !value.trim()} className="h-12 min-w-36">
          {ui.kind === "pending" ? (
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
      <div id={`${fid}-fb`} role="status" aria-live="polite" className="mt-3 min-h-6 font-mono text-[0.78rem]">
        {disabledReason ? (
          <p className="flex items-center gap-2 text-signal-amber">
            <CircleSlash className="size-4" aria-hidden="true" /> {disabledReason}
          </p>
        ) : ui.kind === "incorrect" ? (
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-signal-magenta">
            <GlitchText burst burstKey={ui.attempt} className="font-bold tracking-[0.12em]" as="span">
              ACCESS DENIED
            </GlitchText>
            <span className="text-ink-dim">
              {ui.freeLeft > 0 ? `${ui.freeLeft} more ${ui.freeLeft === 1 ? "miss" : "misses"} before a cooldown.` : "Next miss starts a cooldown."}
            </span>
          </p>
        ) : ui.kind === "cooldown" ? (
          <p className="flex items-center gap-2 text-signal-amber">
            <Timer className="size-4" aria-hidden="true" /> {ui.message} {cooling ? `Retry in ${formatDuration(ui.until - now)}.` : ""}
          </p>
        ) : ui.kind === "error" ? (
          <p className={cn("flex items-center gap-2", ui.offline ? "text-signal-amber" : "text-signal-magenta")}>
            {ui.offline ? <WifiOff className="size-4" aria-hidden="true" /> : <CircleSlash className="size-4" aria-hidden="true" />} {ui.message}
          </p>
        ) : ui.kind === "pending" ? (
          <p className="text-mute">Transmitting…</p>
        ) : (
          <p className="text-faint">{isFlag ? "Flags are case-sensitive." : answerType === "number" ? "Digits only; separators are ignored." : "Case and spacing don't matter."}</p>
        )}
      </div>
    </form>
  );
}
