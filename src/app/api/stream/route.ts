import { getDb } from "@/server/db/client";
import { cookieName, resolveStaffSession, resolveTeamSession } from "@/server/auth/session";
import { getActiveEvent } from "@/server/engine/event";
import { verifyDisplayToken } from "@/server/engine/display";
import { bus, topics, type BusMessage } from "@/server/realtime/bus";
import { errorResponse, parseCookies } from "@/server/http";
import { GameError } from "@/server/engine/errors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PUBLIC_EVENT_TYPES = new Set(["leaderboard", "announcement", "event-status", "first-blood", "content"]);

/**
 * Server-Sent Events. Messages are tiny change signals; clients re-fetch
 * what they need. A comment heartbeat keeps proxies from idling the stream.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const scope = url.searchParams.get("scope") ?? "team";
    const db = await getDb();
    const event = await getActiveEvent(db);
    if (!event) throw new GameError("not_found", "No active event.");
    const cookies = parseCookies(req.headers.get("cookie"));
    let subscribed: string[];
    let filter: (m: BusMessage) => boolean = () => true;

    if (scope === "team") {
      const s = await resolveTeamSession(db, cookies[cookieName("team")]);
      if (!s || s.team.eventId !== event.id) throw new GameError("unauthorized", "Sign in first.");
      subscribed = [topics.event(event.id), topics.team(s.team.id)];
      filter = (m) => m.topic !== topics.event(event.id) || PUBLIC_EVENT_TYPES.has(m.type);
    } else if (scope === "staff") {
      const s = await resolveStaffSession(db, cookies[cookieName("staff")]);
      if (!s) throw new GameError("unauthorized", "Staff sign-in required.");
      subscribed = [topics.event(event.id), topics.staff(event.id)];
      if (s.kind === "station") filter = (m) => m.topic === topics.staff(event.id) ? m.type === "checkpoint" : PUBLIC_EVENT_TYPES.has(m.type);
    } else if (scope === "display") {
      const staff = await resolveStaffSession(db, cookies[cookieName("staff")]);
      if (!staff && !verifyDisplayToken(event, url.searchParams.get("k") ?? "")) throw new GameError("unauthorized", "Invalid display link.");
      subscribed = [topics.event(event.id)];
      filter = (m) => PUBLIC_EVENT_TYPES.has(m.type);
    } else {
      throw new GameError("invalid", "Unknown scope.");
    }

    const encoder = new TextEncoder();
    let cleanup = () => {};
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const send = (chunk: string) => {
          try {
            controller.enqueue(encoder.encode(chunk));
          } catch {
            cleanup();
          }
        };
        send(`retry: 5000\n\n`);
        send(`data: ${JSON.stringify({ type: "hello" })}\n\n`);
        const unsubscribe = bus().subscribe(subscribed, (m) => {
          if (!filter(m)) return;
          send(`data: ${JSON.stringify({ type: m.type, data: m.data ?? {} })}\n\n`);
        });
        const ping = setInterval(() => send(`: ping\n\n`), 20_000);
        cleanup = () => {
          clearInterval(ping);
          unsubscribe();
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        };
        req.signal.addEventListener("abort", () => cleanup());
      },
      cancel() {
        cleanup();
      },
    });
    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-store, no-transform",
        connection: "keep-alive",
        "x-accel-buffering": "no",
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
