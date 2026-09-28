"use client";

import { Gavel, ShieldAlert, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import DecryptedText from "@/components/reactbits/DecryptedText";
import GlitchText from "@/components/reactbits/GlitchText";
import HoldButton from "@/components/reactbits/HoldButton";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { AccusationResult, AccusationStateView } from "@/server/engine/inquest";

/**
 * Filing an accusation is deliberate: every field must be answered, the cost
 * of being wrong is shown up front, and the final action is a 2-second
 * hold-to-confirm (React Bits HoldButton — keyboard: hold Space/Enter).
 * Feedback tells the team HOW MANY findings were right, never which.
 */
export function AccusationForm({ state, portraits, disabledReason }: { state: AccusationStateView; portraits: Record<string, string | null>; disabledReason?: string | null }) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<AccusationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const complete = state.fields.every((f) => answers[f.id]);
  const attemptsLeft = state.maxAttempts - state.attemptsUsed;

  const file = async () => {
    if (!complete || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api<AccusationResult>("/api/play/inquest/accuse", { body: { answers } });
      setResult(r);
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not file the accusation.");
    } finally {
      setBusy(false);
    }
  };

  if (result) {
    return (
      <div role="status" aria-live="assertive" className={cn("panel p-5", result.fullyCorrect ? "glow [--glow:var(--color-signal-green)]" : "border-[color-mix(in_srgb,var(--color-signal-magenta)_45%,var(--color-line))]")}>
        {result.fullyCorrect ? (
          <>
            <ShieldCheck className="size-6 text-signal-green" aria-hidden="true" />
            <p className="mt-2 font-mono text-2xl font-bold tracking-[0.08em] text-signal-green">
              <DecryptedText text="CASE CLOSED" animateOn="mount" sequential speed={40} />
            </p>
            <p className="mt-1 text-sm text-ink-dim">Every finding confirmed. Your verdict is locked in for +{result.credit} points.</p>
          </>
        ) : (
          <>
            <ShieldAlert className="size-6 text-signal-magenta" aria-hidden="true" />
            <p className="mt-2 font-mono text-2xl font-bold tracking-[0.08em] text-signal-magenta">
              <GlitchText burst burstMs={700}>VERDICT REJECTED</GlitchText>
            </p>
            <p className="mt-2 font-mono text-sm text-ink">
              {result.correctCount} of {result.totalFields} findings confirmed.
            </p>
            <p className="mt-1 text-sm text-ink-dim">
              Net change {result.delta >= 0 ? "+" : "−"}
              {Math.abs(result.delta)} points (penalty {result.penalty}). {result.locked ? "No attempts remain — your verdict is final." : `${result.attemptsLeft} attempt${result.attemptsLeft === 1 ? "" : "s"} left.`}
            </p>
          </>
        )}
        {!result.locked ? (
          <button type="button" onClick={() => setResult(null)} className="mt-4 font-mono text-xs uppercase tracking-[0.12em] text-signal-2 underline underline-offset-4">
            Revise accusation
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
      }}
      className="space-y-6"
    >
      {state.fields.map((f, idx) => (
        <fieldset key={f.id} className="panel p-4 sm:p-5">
          <legend className="sr-only">{f.label}</legend>
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <p className="font-mono text-sm font-semibold" aria-hidden="true">
              <span className="text-faint">{String(idx + 1).padStart(2, "0")} ·</span> {f.label}
            </p>
            <span className="label-mono shrink-0">{f.points} pts</span>
          </div>
          {f.options.length === 0 ? (
            <p className="font-mono text-xs text-faint">No options available yet — uncover more evidence.</p>
          ) : (
            <div className={cn("grid gap-2", f.type === "suspect" ? "grid-cols-2 sm:grid-cols-4" : "sm:grid-cols-2")} role="radiogroup" aria-label={f.label}>
              {f.options.map((o) => {
                const checked = answers[f.id] === o.id;
                const img = f.type === "suspect" ? portraits[o.id] : null;
                return (
                  <label
                    key={o.id}
                    className={cn(
                      "pressable relative flex cursor-pointer gap-2 overflow-hidden rounded-sm border bg-bg has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--accent)]",
                      f.type === "suspect" ? "flex-col" : "items-center px-3 py-2.5",
                      checked ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_8%,var(--color-bg))]" : "border-line hover:border-line-strong",
                    )}
                  >
                    <input
                      type="radio"
                      name={f.id}
                      value={o.id}
                      checked={checked}
                      disabled={Boolean(disabledReason)}
                      onChange={() => setAnswers((a) => ({ ...a, [f.id]: o.id }))}
                      className="sr-only"
                    />
                    {f.type === "suspect" ? (
                      <>
                        {img ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={img} alt="" className={cn("aspect-[4/5] w-full object-cover", !checked && "grayscale")} />
                        ) : (
                          <span className="aspect-[4/5] w-full bg-raised" aria-hidden="true" />
                        )}
                        <span className="px-2 pb-2 font-mono text-xs">{o.label}</span>
                      </>
                    ) : (
                      <>
                        <span aria-hidden="true" className={cn("grid size-4 shrink-0 place-items-center rounded-full border", checked ? "border-[var(--accent)]" : "border-line-strong")}>
                          {checked ? <span className="size-2 rounded-full bg-signal" /> : null}
                        </span>
                        <span className="text-sm">{o.label}</span>
                      </>
                    )}
                  </label>
                );
              })}
            </div>
          )}
        </fieldset>
      ))}

      <div className="panel space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 font-mono text-xs">
          <span>
            Attempts left: <span className="num text-ink">{attemptsLeft}</span>/{state.maxAttempts}
          </span>
          <span className="text-signal-amber">A wrong verdict costs {state.nextPenalty} points</span>
        </div>
        {disabledReason ? <p className="font-mono text-xs text-signal-amber">{disabledReason}</p> : null}
        {error ? (
          <p role="alert" className="font-mono text-xs text-signal-magenta">
            {error}
          </p>
        ) : null}
        <HoldButton
          size="md"
          holdTime={1800}
          disabled={!complete || busy || Boolean(disabledReason)}
          backgroundColor="var(--color-raised)"
          fillColor="var(--color-signal-magenta)"
          textColor="var(--color-ink)"
          fillTextColor="var(--color-bg)"
          radius={3}
          resetAfter={0}
          doneLabel={busy ? "Filing…" : "Filed"}
          icon={<Gavel className="size-4" />}
          onHold={file}
          className="w-full font-mono text-[0.78rem] uppercase tracking-[0.1em]"
        >
          {complete ? "Hold to accuse" : `Answer all ${state.fields.length} first`}
        </HoldButton>
      </div>
    </form>
  );
}
