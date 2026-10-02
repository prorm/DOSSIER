import { z } from "zod";

import { getDb } from "@/server/db/client";
import { GameError } from "@/server/engine/errors";
import { demoTrafficAvailable, demoTrafficStatus, startDemoTraffic, stopDemoTraffic } from "@/server/game/demo-traffic";
import { readJson, route } from "@/server/http";

const Body = z.object({ on: z.boolean(), spare: z.string().max(80).nullable().optional() });

/** Demo traffic for showcases (see server/game/demo-traffic.ts). Admin staff only, and only where the deployment opts in. */
export const GET = route({ auth: "staff", role: "admin" }, async () => demoTrafficStatus());

export const POST = route({ auth: "staff", role: "admin", event: true }, async ({ req, event }) => {
  if (!demoTrafficAvailable()) throw new GameError("forbidden", "Demo traffic is not enabled on this deployment.");
  const body = await readJson(req, Body);
  if (!body.on) {
    stopDemoTraffic();
    return demoTrafficStatus();
  }
  return startDemoTraffic(getDb, event!, body.spare ?? process.env.DEMO_TRAFFIC_SPARE ?? null);
});
