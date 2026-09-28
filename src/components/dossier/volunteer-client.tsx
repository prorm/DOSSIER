"use client";

import { Camera, CameraOff, Check, LogOut, Search, UserCheck, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import CodeSlots from "@/components/reactbits/CodeSlots";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useIsClient } from "./effects";
import { CheckpointMark } from "./live-client";
import { LocalTime } from "./local-time";
import { useRealtime } from "./realtime";

/* ─────────────────────────── Station login ─────────────────────────── */

/** Station sign-in: pick the checkpoint, enter its PIN on mechanical code reels (React Bits CodeSlots). */
export function StationLogin({ checkpoints }: { checkpoints: { id: string; name: string }[] }) {
  const router = useRouter();
  const [cp, setCp] = useState(checkpoints[0]?.id ?? "");
  const [pin, setPin] = useState("");
  const [status, setStatus] = useState<"idle" | "error" | "success">("idle");
  const [error, setError] = useState<string | null>(null);
  const [len, setLen] = useState(4);

  const submit = async (code: string) => {
    setError(null);
    try {
      await api("/api/station/login", { body: { checkpointId: cp, pin: code } });
      setStatus("success");
      setTimeout(() => router.refresh(), 500);
    } catch (e) {
      setStatus("error");
      setError(e instanceof ApiError ? e.message : "Sign-in failed.");
      setTimeout(() => {
        setStatus("idle");
        setPin("");
      }, 900);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="st-cp">Checkpoint</Label>
        <select id="st-cp" value={cp} onChange={(e) => setCp(e.target.value)} className="h-11 rounded-sm border border-line-strong bg-bg px-2 font-mono text-sm text-ink">
          {checkpoints.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="label-mono">Station PIN</span>
          <span className="flex gap-1">
            {[4, 6, 8].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => {
                  setLen(n);
                  setPin("");
                }}
                aria-pressed={len === n}
                className={cn("rounded-xs border px-1.5 font-mono text-[0.65rem]", len === n ? "border-[var(--accent)] text-signal" : "border-line text-mute")}
              >
                {n}
              </button>
            ))}
          </span>
        </div>
        <CodeSlots
          key={len}
          length={len}
          value={pin}
          onChange={setPin}
          onComplete={submit}
          status={status}
          mask
          autoFocus
          ariaLabel="Station PIN"
          slotSize={len > 6 ? 36 : 44}
          accentColor="var(--accent)"
          inkColor="var(--color-ink)"
          slotColor="var(--color-raised)"
          digitColor="var(--color-bg)"
          dangerColor="var(--color-signal-magenta)"
          radius={4}
        />
        {error ? (
          <p role="alert" className="font-mono text-xs text-signal-magenta">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/* ─────────────────────────── Station console ─────────────────────────── */

interface QueueRow {
  id: string;
  teamId: string;
  teamName: string;
  status: "pending" | "confirmed" | "rejected";
  method: string;
  createdAt: string;
  decidedAt: string | null;
  decidedBy: string | null;
}

interface QueueData {
  checkpoint?: { id: string; name: string; location: string; points: number; requiresApproval: boolean };
  checkpoints?: { id: string; name: string }[];
  queue: QueueRow[];
}

type BarcodeDetectorCtor = new (opts: { formats: string[] }) => { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> };

/**
 * Station console for volunteers: approve/reject team scans, scan a team's
 * rotating badge with the camera (BarcodeDetector where supported, paste as a
 * fallback) or look a team up and award manually with a note. Every action is
 * audited server-side; decisions retry automatically on flaky Wi-Fi.
 */
export function StationConsole({ fixedCheckpoint, isStaff }: { fixedCheckpoint: boolean; isStaff: boolean }) {
  const router = useRouter();
  const [cp, setCp] = useState<string | null>(null);
  const [data, setData] = useState<QueueData | null>(null);
  const [flash, setFlash] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [offline, setOffline] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api<QueueData>(`/api/volunteer/queue${cp ? `?cp=${encodeURIComponent(cp)}` : ""}`);
      setData(d);
      setOffline(false);
    } catch (e) {
      if (e instanceof ApiError && e.code === "offline") setOffline(true);
    }
  }, [cp]);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const t = setInterval(load, 20_000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [load]);
  useRealtime(() => void load(), ["checkpoint", "reconnected"]);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 4000);
    return () => clearTimeout(t);
  }, [flash]);

  const act = async (path: string, body: unknown, ok: string, attempt = 0): Promise<boolean> => {
    try {
      const r = await api<{ status?: string; team?: { name: string }; duplicate?: boolean }>(path, { body });
      setFlash({ tone: "ok", text: r.duplicate ? `${r.team?.name ?? "Team"} was already confirmed here.` : ok.replace("{team}", r.team?.name ?? "Team") });
      void load();
      return true;
    } catch (e) {
      if (e instanceof ApiError && e.code === "offline" && attempt < 5) {
        setFlash({ tone: "err", text: "No connection — retrying…" });
        await new Promise((r) => setTimeout(r, 1500 * 2 ** attempt));
        return act(path, body, ok, attempt + 1);
      }
      setFlash({ tone: "err", text: e instanceof ApiError ? e.message : "Action failed." });
      return false;
    }
  };

  const signOut = async () => {
    await api("/api/staff/logout", { method: "POST", body: {} }).catch(() => {});
    router.refresh();
  };

  if (!data) return <div className="skeleton h-64 w-full" aria-label="Loading station" />;

  if (!data.checkpoint) {
    return (
      <div className="space-y-3">
        <p className="label-mono">Choose your station</p>
        <ul className="grid gap-2 sm:grid-cols-2">
          {(data.checkpoints ?? []).map((c) => (
            <li key={c.id}>
              <Button variant="outline" className="h-14 w-full justify-start" onClick={() => setCp(c.id)}>
                {c.name}
              </Button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const pending = data.queue.filter((q) => q.status === "pending");
  const done = data.queue.filter((q) => q.status !== "pending").slice(0, 15);
  const checkpointId = data.checkpoint.id;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="label-mono">Station</p>
          <h1 className="font-mono text-xl font-semibold uppercase">{data.checkpoint.name}</h1>
          <p className="font-mono text-xs text-mute">
            {data.checkpoint.location} · {data.checkpoint.points} pts · {data.checkpoint.requiresApproval ? "approval required" : "auto-confirm"}
            {offline ? <span className="ml-2 text-signal-amber">· offline</span> : null}
          </p>
        </div>
        <div className="flex gap-2">
          {!fixedCheckpoint && isStaff ? (
            <Button size="sm" variant="ghost" onClick={() => setCp(null)}>
              Change station
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" onClick={signOut}>
            <LogOut /> Sign out
          </Button>
        </div>
      </header>

      <div role="status" aria-live="assertive" className="min-h-10">
        {flash ? (
          <p
            className={cn(
              "animate-reveal-up rounded-sm border px-3 py-2 font-mono text-sm",
              flash.tone === "ok" ? "border-signal-green/50 bg-signal-green/10 text-signal-green" : "border-signal-magenta/50 bg-signal-magenta/10 text-signal-magenta",
            )}
          >
            {flash.text}
          </p>
        ) : null}
      </div>

      <section aria-labelledby="pend">
        <h2 id="pend" className="label-mono mb-2">
          Waiting for approval ({pending.length})
        </h2>
        {pending.length === 0 ? (
          <p className="panel px-4 py-6 text-center font-mono text-xs text-faint">No pending scans. Teams appear here the moment they scan your code.</p>
        ) : (
          <ul className="space-y-2">
            {pending.map((q) => (
              <li key={q.id} className="panel flex flex-wrap items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-base font-semibold">{q.teamName}</p>
                  <p className="font-mono text-[0.68rem] text-mute">
                    scanned <LocalTime iso={q.createdAt} />
                  </p>
                </div>
                <Button variant="destructive" size="lg" className="h-12" onClick={() => act("/api/volunteer/decide", { scanId: q.id, approve: false }, `Rejected ${q.teamName}.`)}>
                  <X /> Reject
                </Button>
                <Button size="lg" className="h-12 min-w-32" onClick={() => act("/api/volunteer/decide", { scanId: q.id, approve: true }, `Approved ${q.teamName}.`)}>
                  <Check /> Approve
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-4 [&>*]:min-w-0 lg:grid-cols-2">
        <BadgeScanner onToken={(t) => act("/api/volunteer/award", { badge: t, checkpointId }, "{team} confirmed via badge.")} />
        <ManualAward checkpointId={checkpointId} onAward={(teamId, note) => act("/api/volunteer/award", { teamId, note, checkpointId }, "{team} confirmed manually.")} />
      </div>

      <section aria-labelledby="hist">
        <h2 id="hist" className="label-mono mb-2">
          Recent decisions
        </h2>
        <ul className="panel divide-y divide-line">
          {done.length === 0 ? <li className="px-3 py-3 font-mono text-xs text-faint">None yet.</li> : null}
          {done.map((q) => (
            <li key={q.id} className="flex items-center gap-3 px-3 py-2">
              <span className="min-w-0 flex-1 truncate font-mono text-sm">{q.teamName}</span>
              <CheckpointMark status={q.status} size={16} />
              <span className="hidden font-mono text-[0.65rem] text-faint sm:inline">{q.decidedBy}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function BadgeScanner({ onToken }: { onToken: (t: string) => Promise<boolean> }) {
  const video = useRef<HTMLVideoElement>(null);
  const [on, setOn] = useState(false);
  const client = useIsClient();
  const supported = client && "BarcodeDetector" in window && Boolean(navigator.mediaDevices?.getUserMedia);
  const [manual, setManual] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const busy = useRef(false);
  const last = useRef("");


  useEffect(() => {
    if (!on) return;
    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        if (!video.current || stopped) return;
        video.current.srcObject = stream;
        await video.current.play();
        const Detector = (window as unknown as { BarcodeDetector: BarcodeDetectorCtor }).BarcodeDetector;
        const det = new Detector({ formats: ["qr_code"] });
        const tick = async () => {
          if (stopped || !video.current) return;
          if (!busy.current && video.current.readyState >= 2) {
            try {
              const codes = await det.detect(video.current);
              const v = codes[0]?.rawValue;
              if (v && v !== last.current && v.startsWith("v1.")) {
                last.current = v;
                busy.current = true;
                await onToken(v);
                setTimeout(() => (busy.current = false), 1200);
              }
            } catch {
              /* frame not ready */
            }
          }
          raf = requestAnimationFrame(() => void tick());
        };
        void tick();
      } catch {
        setErr("Camera unavailable. Allow camera access or paste the badge code below.");
        setOn(false);
      }
    })();
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [on, onToken]);

  return (
    <section className="panel space-y-3 p-4" aria-labelledby="scan-h">
      <h2 id="scan-h" className="label-mono flex items-center gap-2">
        <Camera className="size-3.5" aria-hidden="true" /> Scan team badge
      </h2>
      {supported ? (
        <>
          <div className={cn("relative overflow-hidden rounded-sm border border-line bg-bg", on ? "aspect-square max-h-72" : "hidden")}>
            <video ref={video} muted playsInline className="size-full object-cover" aria-label="Camera preview" />
            <div aria-hidden="true" className="pointer-events-none absolute inset-8 border-2 border-[var(--accent)]/70" />
            <div aria-hidden="true" className="pointer-events-none absolute inset-x-8 top-1/2 h-px animate-pulse-dot bg-[var(--accent)]" />
          </div>
          <Button variant={on ? "outline" : "signal"} onClick={() => setOn((v) => !v)} className="w-full">
            {on ? <CameraOff /> : <Camera />} {on ? "Stop camera" : "Start camera"}
          </Button>
        </>
      ) : (
        <p className="font-mono text-xs text-mute">This browser cannot decode QR codes directly — paste the code instead, or use team lookup.</p>
      )}
      <form
        className="flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await onToken(manual.trim())) setManual("");
        }}
      >
        <Input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="v1.… badge code" aria-label="Badge code" className="font-mono text-xs" />
        <Button type="submit" variant="outline" disabled={!manual.trim().startsWith("v1.")}>
          Award
        </Button>
      </form>
      {err ? <p className="font-mono text-xs text-signal-amber">{err}</p> : null}
    </section>
  );
}

function ManualAward({ onAward }: { checkpointId: string; onAward: (teamId: string, note: string) => Promise<boolean> }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ id: string; name: string; status: string }[]>([]);
  const [pick, setPick] = useState<{ id: string; name: string } | null>(null);
  const [note, setNote] = useState("");
  useEffect(() => {
    if (q.trim().length < 2) return;
    const t = setTimeout(async () => {
      try {
        setResults((await api<{ teams: { id: string; name: string; status: string }[] }>(`/api/volunteer/teams?q=${encodeURIComponent(q)}`)).teams);
      } catch {
        /* ignore */
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <section className="panel space-y-3 p-4" aria-labelledby="man-h">
      <h2 id="man-h" className="label-mono flex items-center gap-2">
        <UserCheck className="size-3.5" aria-hidden="true" /> Team lookup
      </h2>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-mute" aria-hidden="true" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search team name" aria-label="Search team name" className="pl-9" />
      </div>
      {q.trim().length >= 2 && results.length ? (
        <ul className="max-h-40 divide-y divide-line overflow-y-auto rounded-sm border border-line">
          {results.map((t) => (
            <li key={t.id}>
              <button type="button" onClick={() => setPick(t)} className={cn("w-full px-3 py-2 text-left font-mono text-sm hover:bg-raised", pick?.id === t.id && "bg-raised text-signal")}>
                {t.name} {t.status === "disqualified" ? <span className="text-signal-magenta">(DQ)</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {pick ? (
        <form
          className="space-y-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await onAward(pick.id, note)) {
              setPick(null);
              setNote("");
              setQ("");
            }
          }}
        >
          <Label htmlFor="man-note">How did you verify {pick.name}? (required)</Label>
          <Textarea id="man-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="e.g. Checked team member IDs; phone battery dead" />
          <Button type="submit" disabled={note.trim().length < 3} className="w-full">
            Award {pick.name}
          </Button>
        </form>
      ) : null}
    </section>
  );
}
