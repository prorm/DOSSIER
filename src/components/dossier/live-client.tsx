"use client";

import { CheckCircle2, CloudOff, RefreshCw, XCircle } from "lucide-react";
import Link from "next/link";
import QRCode from "qrcode";
import { useCallback, useEffect, useRef, useState } from "react";

import DecryptedText from "@/components/reactbits/DecryptedText";
import StatusMark, { type StatusMarkStatus } from "@/components/reactbits/StatusMark";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useRealtime } from "./realtime";

export type CheckpointStatus = "open" | "pending" | "confirmed" | "rejected";

const MARK: Record<CheckpointStatus, StatusMarkStatus> = { open: "pending", pending: "running", confirmed: "done", rejected: "failed" };
const WORD: Record<CheckpointStatus, string> = { open: "Not visited", pending: "Awaiting volunteer", confirmed: "Confirmed", rejected: "Rejected" };

/** Checkpoint status glyph (React Bits StatusMark) with the state always written out. */
export function CheckpointMark({ status, size = 20 }: { status: CheckpointStatus; size?: number }) {
  return (
    <StatusMark
      status={MARK[status]}
      size={size}
      label={<span className="font-mono text-[0.7rem] uppercase tracking-[0.1em]">{WORD[status]}</span>}
      color={status === "pending" ? "var(--color-signal-amber)" : "var(--color-mute)"}
      doneColor="var(--color-signal-green)"
      errorColor="var(--color-signal-magenta)"
      strike={false}
    />
  );
}

/**
 * Rotating single-use team badge. A volunteer scans it to award a checkpoint.
 * Each code lives 90 seconds and can be redeemed once, so screenshots are useless.
 */
export function TeamBadge() {
  const [data, setData] = useState<{ token: string; expiresAt: string; img: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    try {
      const r = await api<{ token: string; expiresAt: string }>("/api/play/badge");
      const img = await QRCode.toDataURL(r.token, { errorCorrectionLevel: "M", margin: 1, width: 360, color: { dark: "#05070A", light: "#D7E4F0" } });
      setData({ ...r, img });
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load badge.");
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [load]);

  const left = data ? Math.max(0, Math.round((new Date(data.expiresAt).getTime() - now) / 1000)) : 0;
  useEffect(() => {
    if (!data || left > 5) return;
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [left, data, load]);

  return (
    <div className="panel brackets flex flex-col items-center gap-3 p-4 text-center">
      <p className="label-mono">Team badge · show to a volunteer</p>
      {data ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={data.img} alt="Your team's single-use badge QR code" width={220} height={220} className="size-[220px] rounded-xs" />
      ) : (
        <div className="skeleton size-[220px]" aria-label="Loading badge" />
      )}
      {error ? <p className="font-mono text-xs text-signal-magenta">{error}</p> : null}
      <div className="flex w-full items-center gap-3">
        <div className="h-1 flex-1 bg-raised" aria-hidden="true">
          <div className="h-full bg-signal transition-[width] duration-1000 ease-linear" style={{ width: `${(left / 90) * 100}%` }} />
        </div>
        <span className="num w-10 text-right text-xs text-mute">{left}s</span>
        <Button size="icon-xs" variant="ghost" onClick={load} aria-label="Refresh badge">
          <RefreshCw />
        </Button>
      </div>
    </div>
  );
}

type ClaimState =
  | { kind: "sending" }
  | { kind: "queued"; attempt: number }
  | { kind: "pending"; name: string; points: number }
  | { kind: "confirmed"; name: string; points: number; duplicate: boolean }
  | { kind: "rejected"; name: string }
  | { kind: "error"; message: string };

const OUTBOX = "dossier.claims";

function outbox(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(OUTBOX) ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

/**
 * Scanning a checkpoint QR. Designed for bad networks: the claim is written to
 * a local outbox with an idempotency key before sending, retried with backoff
 * until the server acknowledges it, and a retry can never double-claim
 * (one claim per team per checkpoint, server-enforced).
 */
export function ClaimFlow({ token }: { token: string }) {
  const [s, setS] = useState<ClaimState>({ kind: "sending" });
  const attempt = useRef(0);
  const name = useRef("");
  const retry = useRef<() => void>(() => {});

  const send = useCallback(async () => {
    const box = outbox();
    const ref = box[token] ?? crypto.randomUUID();
    box[token] = ref;
    try {
      localStorage.setItem(OUTBOX, JSON.stringify(box));
    } catch {
      /* ignore */
    }
    try {
      const r = await api<{ checkpoint: { id: string; name: string; points: number }; status: string; duplicate: boolean }>("/api/play/checkpoint", {
        body: { token, clientRef: ref },
        timeoutMs: 12_000,
      });
      name.current = r.checkpoint.name;
      const b = outbox();
      delete b[token];
      try {
        localStorage.setItem(OUTBOX, JSON.stringify(b));
      } catch {
        /* ignore */
      }
      if (r.status === "confirmed") setS({ kind: "confirmed", name: r.checkpoint.name, points: r.checkpoint.points, duplicate: r.duplicate });
      else if (r.status === "rejected") setS({ kind: "rejected", name: r.checkpoint.name });
      else setS({ kind: "pending", name: r.checkpoint.name, points: r.checkpoint.points });
    } catch (e) {
      if (e instanceof ApiError && e.code === "offline") {
        attempt.current += 1;
        setS({ kind: "queued", attempt: attempt.current });
        setTimeout(() => retry.current(), Math.min(30_000, 2000 * 2 ** Math.min(attempt.current, 4)));
      } else {
        setS({ kind: "error", message: e instanceof ApiError ? e.message : "Could not record this scan." });
      }
    }
  }, [token]);

  useEffect(() => {
    retry.current = () => void send();
  }, [send]);

  useEffect(() => {
    const first = setTimeout(() => void send(), 0);
    const onOnline = () => void send();
    window.addEventListener("online", onOnline);
    return () => {
      clearTimeout(first);
      window.removeEventListener("online", onOnline);
    };
  }, [send]);

  // Volunteer decision arrives live (or via polling fallback).
  useRealtime(() => {
    if (s.kind === "pending") void send();
  }, ["checkpoint", "team-changed", "reconnected"]);

  return (
    <div role="status" aria-live="polite" className="panel p-6 text-center">
      {s.kind === "sending" ? (
        <>
          <div className="mx-auto w-fit">
            <StatusMark status="running" size={40} />
          </div>
          <p className="mt-4 font-mono text-sm uppercase tracking-[0.12em]">Transmitting scan…</p>
        </>
      ) : s.kind === "queued" ? (
        <>
          <CloudOff className="mx-auto size-10 text-signal-amber" aria-hidden="true" />
          <p className="mt-4 font-mono text-sm uppercase tracking-[0.12em] text-signal-amber">Saved offline — retrying</p>
          <p className="mt-1 text-sm text-ink-dim">No signal right now. Your scan is stored on this phone and will send automatically. Keep this page open.</p>
          <Button variant="outline" className="mt-4" onClick={() => void send()}>
            <RefreshCw /> Retry now
          </Button>
        </>
      ) : s.kind === "pending" ? (
        <>
          <div className="mx-auto w-fit">
            <StatusMark status="running" size={44} color="var(--color-signal-amber)" />
          </div>
          <p className="mt-4 font-mono text-lg font-semibold uppercase tracking-[0.1em] text-signal-amber">Pending approval</p>
          <p className="mt-1 text-sm text-ink-dim">
            <strong className="text-ink">{s.name}</strong> recorded. Show this screen to the station volunteer — it confirms here automatically.
          </p>
        </>
      ) : s.kind === "confirmed" ? (
        <>
          <CheckCircle2 className="mx-auto size-11 text-signal-green" aria-hidden="true" />
          <p className="mt-4 font-mono text-2xl font-bold tracking-[0.08em] text-signal-green">
            <DecryptedText text="CHECKPOINT CLEARED" animateOn="mount" sequential speed={28} />
          </p>
          <p className="mt-1 text-sm text-ink-dim">
            {s.name} · <span className="font-mono text-signal-green">+{s.points} pts</span>
            {s.duplicate ? " (already on record)" : ""}
          </p>
        </>
      ) : s.kind === "rejected" ? (
        <>
          <XCircle className="mx-auto size-11 text-signal-magenta" aria-hidden="true" />
          <p className="mt-4 font-mono text-lg font-semibold uppercase text-signal-magenta">Claim rejected</p>
          <p className="mt-1 text-sm text-ink-dim">The volunteer at {s.name} rejected this claim. Talk to an organiser if this is a mistake.</p>
        </>
      ) : (
        <>
          <XCircle className="mx-auto size-11 text-signal-magenta" aria-hidden="true" />
          <p className="mt-4 font-mono text-lg font-semibold uppercase text-signal-magenta">Scan failed</p>
          <p className="mt-1 text-sm text-ink-dim">{s.message}</p>
        </>
      )}
      <div className={cn("mt-6 flex justify-center gap-2")}>
        <Button asChild variant="outline">
          <Link href="/play/live">All checkpoints</Link>
        </Button>
      </div>
    </div>
  );
}
