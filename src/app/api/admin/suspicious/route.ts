import { route } from "@/server/http";
import { suspiciousSignals } from "@/server/engine/admin";

export const GET = route({ auth: "staff", role: "admin", event: true }, async ({ db, event }) => ({ signals: await suspiciousSignals(db, event!) }));
