import { EventEmitter } from "node:events";
import { getDbHandle } from "../db/client";

/**
 * Realtime fan-out. Messages are tiny "something changed" signals — clients
 * re-fetch the minimal data they need. Topics:
 *   event:<eventId>   leaderboard version, event status, announcements
 *   team:<teamId>     unlocks, reveals, checkpoint decisions for one team
 *   staff:<eventId>   admin/volunteer dashboards
 *
 * Single instance: an in-process EventEmitter.
 * Multiple instances (postgres driver): Postgres LISTEN/NOTIFY bridges nodes.
 */
export interface BusMessage {
  topic: string;
  type: string;
  data?: Record<string, unknown>;
  origin?: string;
}

const CHANNEL = "dossier_bus";
const g = globalThis as unknown as { __dossierBus?: Bus };

class Bus {
  private emitter = new EventEmitter();
  private readonly nodeId = Math.random().toString(36).slice(2);
  private listening: Promise<void> | null = null;
  private notify: ((payload: string) => Promise<unknown>) | null = null;

  constructor() {
    this.emitter.setMaxListeners(10_000);
  }

  private async ensureBridge() {
    if (this.listening) return this.listening;
    this.listening = (async () => {
      try {
        const handle = await getDbHandle();
        if (handle.driver !== "postgres") return;
        const sql = handle.raw as {
          listen: (ch: string, fn: (p: string) => void) => Promise<unknown>;
          notify: (ch: string, p: string) => Promise<unknown>;
        };
        await sql.listen(CHANNEL, (payload) => {
          try {
            const msg = JSON.parse(payload) as BusMessage;
            if (msg.origin !== this.nodeId) this.emitter.emit(msg.topic, msg);
          } catch {
            /* ignore malformed */
          }
        });
        this.notify = (p) => sql.notify(CHANNEL, p);
      } catch {
        this.notify = null; // degrade to single-node
      }
    })();
    return this.listening;
  }

  async publish(topic: string, type: string, data?: Record<string, unknown>) {
    const msg: BusMessage = { topic, type, data, origin: this.nodeId };
    this.emitter.emit(topic, msg);
    await this.ensureBridge();
    if (this.notify) {
      const payload = JSON.stringify(msg);
      if (payload.length < 7900) await this.notify(payload).catch(() => {});
    }
  }

  subscribe(topics: string[], fn: (msg: BusMessage) => void): () => void {
    void this.ensureBridge();
    for (const t of topics) this.emitter.on(t, fn);
    return () => {
      for (const t of topics) this.emitter.off(t, fn);
    };
  }
}

export function bus(): Bus {
  g.__dossierBus ??= new Bus();
  return g.__dossierBus;
}

export const topics = {
  event: (eventId: string) => `event:${eventId}`,
  team: (teamId: string) => `team:${teamId}`,
  staff: (eventId: string) => `staff:${eventId}`,
};
