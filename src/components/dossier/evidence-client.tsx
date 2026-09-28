"use client";

import { Check, Pin, ScanSearch } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { api, ApiError } from "@/lib/api";
import { useCapableDevice, useEffectsEnabled } from "./effects";

const HalftoneReveal = dynamic(() => import("@/components/reactbits/HalftoneReveal"), { ssr: false });

/**
 * Evidence photograph. On capable desktop screens it is presented as a
 * halftone print that resolves to the real image under the cursor (React Bits
 * HalftoneReveal). Everywhere else — touch, reduced motion, effects off — the
 * plain image. The <img> is always in the DOM with alt text.
 */
export function EvidenceImage({ src, alt }: { src: string; alt: string }) {
  const effects = useEffectsEnabled();
  const capable = useCapableDevice(900);
  const fine = useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia("(hover: hover) and (pointer: fine)");
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia("(hover: hover) and (pointer: fine)").matches,
    () => false,
  );
  const fx = effects && capable && fine;
  return (
    <figure className="panel overflow-hidden">
      <div className="relative bg-bg">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} className={fx ? "invisible block w-full" : "block w-full"} />
        {fx ? (
          <div className="absolute inset-0">
            <HalftoneReveal src={src} mode="mono" inkColor="#05070a" paperColor="#9fb3c8" dotDensity={90} revealRadius={0.32} borderRadius="0px" trigger="hover" />
          </div>
        ) : null}
      </div>
      <figcaption className="flex items-center gap-2 border-t border-line px-3 py-2 font-mono text-[0.65rem] uppercase tracking-[0.12em] text-mute">
        <ScanSearch className="size-3.5" aria-hidden="true" />
        {fx ? "Move over the print to examine" : "Exhibit photograph"}
      </figcaption>
    </figure>
  );
}

/** Marks the exhibit as seen (clears the NEW tag) once it has been opened. */
export function SeenMarker({ evidenceId, isNew }: { evidenceId: string; isNew: boolean }) {
  useEffect(() => {
    if (!isNew) return;
    api("/api/play/inquest/seen", { body: { evidenceId } }).catch(() => {});
  }, [evidenceId, isNew]);
  return null;
}

/** Pin to board + private team annotation (stored with the board, visible to your team only). */
export function EvidenceBoardActions({ evidenceId, onBoard, annotation }: { evidenceId: string; onBoard: boolean; annotation: string }) {
  const [pinned, setPinned] = useState(onBoard);
  const [note, setNote] = useState(annotation);
  const [saved, setSaved] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const id = `ev:${evidenceId}`;

  const pin = async () => {
    try {
      await api("/api/play/inquest/board", { body: { ops: [{ op: "place", id, x: 80 + Math.round(Math.random() * 400), y: 80 + Math.round(Math.random() * 260) }] } });
      setPinned(true);
    } catch (e) {
      setSaved("error");
      console.warn(e instanceof ApiError ? e.message : e);
    }
  };
  const save = async () => {
    setSaved("saving");
    try {
      await api("/api/play/inquest/board", { body: { ops: [{ op: "annotate", id, text: note.slice(0, 1000) }] } });
      setSaved("saved");
    } catch {
      setSaved("error");
    }
  };

  return (
    <div className="panel space-y-3 p-4">
      <Button variant={pinned ? "outline" : "signal"} className="w-full" onClick={pin} disabled={pinned}>
        {pinned ? <Check /> : <Pin />} {pinned ? "On your board" : "Pin to evidence board"}
      </Button>
      <div>
        <label htmlFor={`note-${evidenceId}`} className="label-mono mb-1.5 block">
          Private note (team only)
        </label>
        <Textarea
          id={`note-${evidenceId}`}
          value={note}
          maxLength={1000}
          onChange={(e) => {
            setNote(e.target.value);
            setSaved("idle");
          }}
          onBlur={() => note !== annotation && void save()}
          placeholder="What does this tell you?"
          className="min-h-24"
        />
        <p className="mt-1 font-mono text-[0.65rem] text-faint" role="status">
          {saved === "saving" ? "Saving…" : saved === "saved" ? "Saved to your board" : saved === "error" ? "Not saved — check your connection" : "Saves when you leave the field"}
        </p>
      </div>
    </div>
  );
}
