"use client";

import { KeyRound, Lock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import TextType from "@/components/reactbits/TextType";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";
export interface HintView {
  index: number;
  level: string;
  cost: number;
  currency: string;
  purchased: boolean;
  purchasable: boolean;
  text?: string;
}
import { Markdown } from "./markdown-client";

/**
 * Hints are bought in order and cost points (shown up-front, confirmed in a
 * dialog). A just-bought hint types in; already-owned hints render instantly.
 */
export function HintPanel({ challengeId, hints, disabled }: { challengeId: string; hints: HintView[]; disabled?: boolean }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState<HintView | null>(null);
  const [fresh, setFresh] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Once solved, unbought hints are irrelevant: show only what the team already owns.
  const shown = disabled ? hints.filter((h) => h.purchased || fresh[h.index] !== undefined) : hints;
  if (!shown.length) return null;

  const buy = async () => {
    if (!confirm) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ text: string }>("/api/play/hint", { body: { challengeId, index: confirm.index } });
      setFresh((f) => ({ ...f, [confirm.index]: r.text }));
      setConfirm(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not unlock the hint.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="hints-h" className="panel p-4 sm:p-5">
      <h2 id="hints-h" className="label-mono mb-3 flex items-center gap-2">
        <KeyRound className="size-3.5" aria-hidden="true" /> Hints
      </h2>
      <ol className="space-y-2">
        {shown.map((h) => {
          const text = fresh[h.index] ?? h.text;
          return (
            <li key={h.index} className="rounded-sm border border-line bg-bg p-3">
              <div className="flex items-center justify-between gap-3">
                <span className="font-mono text-[0.72rem] uppercase tracking-[0.1em] text-mute">
                  Hint {h.index + 1} · {h.level.replace("-", " ")}
                  <span className="ml-2 text-signal-amber">
                    −{h.cost} {h.currency === "tokens" ? "tokens" : "pts"}
                  </span>
                </span>
                {text === undefined ? (
                  <Button
                    size="xs"
                    variant="signal"
                    disabled={!h.purchasable || disabled}
                    onClick={() => setConfirm(h)}
                    aria-label={h.purchasable ? `Unlock hint ${h.index + 1} for ${h.cost} points` : `Hint ${h.index + 1} locked: unlock the previous hint first`}
                  >
                    {h.purchasable ? "Decrypt" : <Lock className="size-3" />}
                  </Button>
                ) : null}
              </div>
              {text !== undefined ? (
                <div className="mt-2 text-sm text-ink-dim">
                  {fresh[h.index] !== undefined ? <TextType text={text} as="div" className="prose-dossier" /> : <Markdown>{text}</Markdown>}
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
      <AlertDialog open={Boolean(confirm)} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Decrypt hint {confirm ? confirm.index + 1 : ""}?</AlertDialogTitle>
            <AlertDialogDescription>
              This costs{" "}
              <span className="font-mono font-semibold text-signal-amber">
                {confirm?.cost ?? 0} {confirm?.currency === "tokens" ? "hint tokens" : "points"}
              </span>
              {confirm?.currency === "tokens" ? ", immediately and permanently." : " from your team score, immediately and permanently."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error ? <p className="font-mono text-xs text-signal-magenta">{error}</p> : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Keep points</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                void buy();
              }}
            >
              {busy ? "Decrypting…" : `Spend ${confirm?.cost ?? 0}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
