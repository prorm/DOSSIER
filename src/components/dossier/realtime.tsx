"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";

/**
 * Realtime link. Server-Sent Events first; if the stream fails repeatedly (captive
 * portals, proxies that buffer, flaky campus Wi-Fi) we fall back to polling a tiny
 * state endpoint and synthesise the same events from version changes.
 */

export type ConnectionState = "connecting" | "live" | "polling" | "offline";
export interface RealtimeMessage {
  type: string;
  data?: Record<string, unknown>;
}

type Listener = (msg: RealtimeMessage) => void;

interface Ctx {
  state: ConnectionState;
  subscribe: (fn: Listener) => () => void;
}

const RealtimeContext = createContext<Ctx>({ state: "offline", subscribe: () => () => {} });

interface PollState {
  lbVersion: number;
  teamStamp?: string;
  eventStatus?: string;
  frozen?: boolean;
  lastAnnouncement?: { id: string; title: string; body: string; level: string; at: string } | null;
}

export function RealtimeProvider({
  children,
  streamUrl,
  pollUrl,
  refreshOn = [],
  pollMs = 15_000,
}: {
  children: ReactNode;
  streamUrl: string;
  pollUrl: string;
  /** Message types that should re-render server components (debounced). */
  refreshOn?: string[];
  pollMs?: number;
}) {
  const router = useRouter();
  const [state, setState] = useState<ConnectionState>("connecting");
  const listeners = useRef(new Set<Listener>());
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const refreshSet = useMemo(() => new Set(refreshOn), [refreshOn]);

  const emit = useCallback(
    (msg: RealtimeMessage) => {
      for (const l of listeners.current) l(msg);
      if (refreshSet.has(msg.type)) {
        clearTimeout(refreshTimer.current);
        // Jitter so hundreds of clients don't re-render in the same millisecond.
        refreshTimer.current = setTimeout(() => router.refresh(), 250 + Math.random() * 750);
      }
    },
    [refreshSet, router],
  );

  useEffect(() => {
    let es: EventSource | null = null;
    let failures = 0;
    let pollTimer: ReturnType<typeof setTimeout> | undefined;
    let last: PollState | null = null;
    let stopped = false;

    const poll = async () => {
      if (stopped) return;
      try {
        const res = await fetch(pollUrl, { cache: "no-store", credentials: "same-origin" });
        if (res.ok) {
          const s = (await res.json()) as PollState;
          if (last) {
            if (s.lbVersion !== last.lbVersion) emit({ type: "leaderboard", data: { version: s.lbVersion } });
            if (s.teamStamp !== last.teamStamp) emit({ type: "team-changed" });
            if (s.eventStatus !== last.eventStatus || s.frozen !== last.frozen) emit({ type: "event-status", data: { status: s.eventStatus, frozen: s.frozen } });
            if (s.lastAnnouncement && s.lastAnnouncement.id !== last.lastAnnouncement?.id) emit({ type: "announcement", data: s.lastAnnouncement });
          }
          last = s;
          setState(navigator.onLine ? "polling" : "offline");
        } else setState("offline");
      } catch {
        setState("offline");
      }
      pollTimer = setTimeout(poll, pollMs + Math.random() * 3000);
    };

    const connect = () => {
      if (stopped || typeof EventSource === "undefined") {
        void poll();
        return;
      }
      es = new EventSource(streamUrl, { withCredentials: true });
      es.onopen = () => {
        failures = 0;
        setState("live");
      };
      es.onmessage = (ev) => {
        try {
          emit(JSON.parse(ev.data) as RealtimeMessage);
        } catch {
          /* ignore */
        }
      };
      es.onerror = () => {
        failures += 1;
        if (failures >= 3) {
          es?.close();
          es = null;
          setState("polling");
          void poll();
          // Retry the stream occasionally; polling continues meanwhile.
          setTimeout(() => {
            if (!stopped && !es) {
              clearTimeout(pollTimer);
              failures = 0;
              connect();
            }
          }, 60_000);
        } else setState("connecting");
      };
    };

    const onOffline = () => setState("offline");
    const onOnline = () => {
      setState("connecting");
      emit({ type: "reconnected" });
    };
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    connect();
    return () => {
      stopped = true;
      es?.close();
      clearTimeout(pollTimer);
      clearTimeout(refreshTimer.current);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, [streamUrl, pollUrl, pollMs, emit]);

  const subscribe = useCallback((fn: Listener) => {
    listeners.current.add(fn);
    return () => listeners.current.delete(fn);
  }, []);

  return <RealtimeContext.Provider value={{ state, subscribe }}>{children}</RealtimeContext.Provider>;
}

export function useRealtime(handler: Listener, types?: string[]) {
  const { subscribe } = useContext(RealtimeContext);
  const ref = useRef(handler);
  useLayoutEffect(() => {
    ref.current = handler;
  });
  const key = types?.join(",");
  useEffect(
    () =>
      subscribe((m) => {
        if (!key || key.split(",").includes(m.type)) ref.current(m);
      }),
    [subscribe, key],
  );
}

export function useConnectionState(): ConnectionState {
  return useContext(RealtimeContext).state;
}
