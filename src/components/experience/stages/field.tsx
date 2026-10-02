"use client";

import { Check, LocateFixed, MapPin, QrCode, ScanLine } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Outcome, useNodeAction } from "@/components/dossier/answer-form";
import { Markdown } from "@/components/dossier/markdown-client";
import { cn } from "@/lib/utils";
import type { StageContext } from "./types";
import { Chip } from "./window";

/** The mission's status as a radar: sweeping while unresolved, locked green once you have been there. */
function Radar({ confirmed, radius }: { confirmed: boolean; radius?: number }) {
  return (
    <div className={cn("radar", confirmed && "is-locked")} role="img" aria-label={confirmed ? "Location confirmed" : "Awaiting confirmation"}>
      <svg viewBox="-100 -100 200 200" aria-hidden="true">
        {[90, 62, 34].map((r) => (
          <circle key={r} r={r} fill="none" stroke="currentColor" strokeOpacity={0.28} strokeWidth={1} />
        ))}
        <path d="M-100 0 H100 M0 -100 V100" stroke="currentColor" strokeOpacity={0.18} />
        {!confirmed ? <path className="radar-sweep" d="M0 0 L0 -90 A90 90 0 0 1 64 -64 Z" fill="currentColor" fillOpacity={0.28} /> : null}
        <circle r={confirmed ? 7 : 4} cx={confirmed ? 0 : 38} cy={confirmed ? 0 : -30} fill="currentColor" />
        {radius ? <circle r={34} fill="currentColor" fillOpacity={0.06} stroke="currentColor" strokeDasharray="3 4" strokeOpacity={0.8} /> : null}
      </svg>
      {confirmed ? <Check className="radar-check size-7" aria-hidden="true" /> : null}
      {radius ? <span className="radar-cap">within ~{Math.round(radius)} m</span> : null}
    </div>
  );
}

export function CheckpointStage({ ctx }: { ctx: StageContext }) {
  const view = ctx.view as unknown as { prompt: string; confirmed: boolean };
  const { ui, run, now } = useNodeAction(ctx.nodeId);
  const cp = ctx.checkpoint;
  return (
    <div className="mission panel">
      <div className="grid gap-6 [&>*]:min-w-0 md:grid-cols-[210px_minmax(0,1fr)]">
        <Radar confirmed={view.confirmed} />
        <div className="space-y-4">
          <p className="label-mono flex items-center gap-2">
            <QrCode className="size-3.5" aria-hidden="true" /> Field mission · {view.confirmed ? "confirmed" : "in the field"}
          </p>
          {view.prompt ? <Markdown>{view.prompt}</Markdown> : null}
          {cp ? (
            <div className="mission-place">
              <p className="flex items-center gap-2 font-display text-base font-semibold">
                <MapPin className="size-4 text-signal-2" aria-hidden="true" /> {cp.name}
              </p>
              {cp.location ? <p className="text-sm text-ink-dim">{cp.location}</p> : null}
              {cp.instructions ? <Markdown>{cp.instructions}</Markdown> : null}
            </div>
          ) : null}
          <ol className="mission-steps">
            <li>Go to the station. Stay on public paths; never enter restricted areas.</li>
            <li>Scan the station&apos;s QR code with your phone camera while signed in — or show your team badge to the volunteer.</li>
            <li>Come back here and confirm.</li>
          </ol>
          <div className="flex flex-wrap gap-2">
            <Link href="/play/live" className="chip-btn !h-10 !px-4">
              <ScanLine className="size-4" /> Field page &amp; badge
            </Link>
            <button type="button" className="chip-btn is-primary !h-10 !px-4" onClick={() => run({ type: "check" })} disabled={ui.kind === "pending"}>
              {view.confirmed ? "Confirmed" : "Check confirmation"}
            </button>
            {ctx.playtestScanUrl ? (
              <a href={ctx.playtestScanUrl} className="chip-btn !h-10 !px-4">
                Playtest: simulate the scan
              </a>
            ) : null}
          </div>
          <Outcome ui={ui} now={now} />
        </div>
      </div>
    </div>
  );
}

export function GpsStage({ ctx }: { ctx: StageContext }) {
  const view = ctx.view as unknown as { prompt: string; radiusM: number; confirmed: boolean };
  const { ui, run, now } = useNodeAction(ctx.nodeId);
  const [status, setStatus] = useState<string | null>(null);
  const locate = () => {
    if (!("geolocation" in navigator)) return setStatus("This browser cannot share its location.");
    setStatus("Asking your phone for a position fix…");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setStatus(null);
        void run({ type: "locate", lat: p.coords.latitude, lon: p.coords.longitude, accuracy: p.coords.accuracy });
      },
      (e) => setStatus(e.code === e.PERMISSION_DENIED ? "Location permission was denied." : "Could not get a position fix. Step outside and retry."),
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 },
    );
  };
  return (
    <div className="mission panel">
      <div className="grid gap-6 [&>*]:min-w-0 md:grid-cols-[210px_minmax(0,1fr)]">
        <Radar confirmed={view.confirmed} radius={view.radiusM} />
        <div className="space-y-4">
          <p className="label-mono flex items-center gap-2">
            <LocateFixed className="size-3.5" aria-hidden="true" /> Field mission · {view.confirmed ? "location verified" : "reach the marked spot"}
          </p>
          {view.prompt ? <Markdown>{view.prompt}</Markdown> : null}
          <p className="text-sm text-ink-dim">Check in from within about {Math.round(view.radiusM)} m of the marked spot. Stay on public paths; never enter restricted areas.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="chip-btn is-primary !h-10 !px-4" onClick={locate} disabled={ui.kind === "pending" || view.confirmed}>
              <LocateFixed className="size-4" /> {view.confirmed ? "Location verified" : "Check in with my location"}
            </button>
            {ctx.gpsTarget ? (
              <button type="button" className="chip-btn !h-10 !px-4" onClick={() => run({ type: "locate", lat: ctx.gpsTarget!.lat, lon: ctx.gpsTarget!.lon, accuracy: 5 })}>
                Playtest: simulate arrival
              </button>
            ) : null}
          </div>
          {status ? <Chip tone="warn">{status}</Chip> : null}
          <Outcome ui={ui} now={now} />
        </div>
      </div>
    </div>
  );
}
