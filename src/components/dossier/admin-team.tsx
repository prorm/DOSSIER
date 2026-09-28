"use client";

import { Ban, KeyRound, Scale, ShieldCheck } from "lucide-react";
import { useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ActionFeedback, useAction } from "./admin-client";

export function TeamActions({ teamId, teamName, status }: { teamId: string; teamName: string; status: string }) {
  const reset = useAction<{ tempPassword: string }>();
  const dq = useAction();
  const adj = useAction();
  const [temp, setTemp] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [delta, setDelta] = useState("");
  const [adjReason, setAdjReason] = useState("");
  const disq = status === "disqualified";

  return (
    <div className="grid gap-4 [&>*]:min-w-0 lg:grid-cols-3">
      <section className="panel space-y-3 p-4">
        <h2 className="label-mono flex items-center gap-2">
          <KeyRound className="size-3.5" aria-hidden="true" /> Password
        </h2>
        <p className="text-sm text-ink-dim">Generates a one-time password and signs the team out everywhere.</p>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" disabled={reset.busy}>
              Reset password
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Reset {teamName}&apos;s password?</AlertDialogTitle>
              <AlertDialogDescription>All of the team&apos;s active sessions end immediately. Hand the new password to the team in person.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={async () => {
                  const r = await reset.run(`/api/admin/teams/${teamId}`, { action: "reset-password" }, { success: "Password reset. Shown once below.", refresh: false });
                  if (r) setTemp(r.tempPassword);
                }}
              >
                Reset
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        {temp ? (
          <p className="rounded-sm border border-[color-mix(in_srgb,var(--accent)_45%,transparent)] bg-bg p-3 font-mono text-lg tracking-[0.08em] text-signal select-all">{temp}</p>
        ) : null}
        <ActionFeedback error={reset.error} message={reset.message} />
      </section>

      <section className="panel space-y-3 p-4">
        <h2 className="label-mono flex items-center gap-2">
          <Scale className="size-3.5" aria-hidden="true" /> Manual adjustment
        </h2>
        <form
          className="space-y-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await adj.run("/api/admin/adjust", { teamId, delta: Number(delta), reason: adjReason }, { success: "Adjustment recorded in the ledger and audit log." });
            if (r) {
              setDelta("");
              setAdjReason("");
            }
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="adj-d">Points (±)</Label>
            <Input id="adj-d" type="number" value={delta} onChange={(e) => setDelta(e.target.value)} required placeholder="-50 or 25" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="adj-r">Reason (mandatory)</Label>
            <Input id="adj-r" value={adjReason} onChange={(e) => setAdjReason(e.target.value)} required minLength={5} maxLength={300} placeholder="e.g. Bonus for spotting a broken challenge" />
          </div>
          <Button type="submit" variant="signal" disabled={adj.busy || !delta || Number(delta) === 0 || adjReason.trim().length < 5}>
            Apply adjustment
          </Button>
        </form>
        <ActionFeedback error={adj.error} message={adj.message} />
      </section>

      <section className="panel space-y-3 p-4">
        <h2 className="label-mono flex items-center gap-2">
          {disq ? <ShieldCheck className="size-3.5" aria-hidden="true" /> : <Ban className="size-3.5" aria-hidden="true" />} Standing
        </h2>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="dq-r">{disq ? "Note (optional)" : "Reason (mandatory)"}</Label>
          <Input id="dq-r" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
        </div>
        {disq ? (
          <Button variant="outline" disabled={dq.busy} onClick={() => dq.run(`/api/admin/teams/${teamId}`, { action: "reinstate", reason }, { success: "Team reinstated." })}>
            Reinstate team
          </Button>
        ) : (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" disabled={dq.busy || reason.trim().length < 3}>
                Disqualify
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Disqualify {teamName}?</AlertDialogTitle>
                <AlertDialogDescription>
                  The team is removed from the ranking and can no longer submit. Their history is kept and the action is reversible and audited.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => dq.run(`/api/admin/teams/${teamId}`, { action: "disqualify", reason }, { success: "Team disqualified." })}>Disqualify</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
        <ActionFeedback error={dq.error} message={dq.message} />
      </section>
    </div>
  );
}
