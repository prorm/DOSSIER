import { route } from "@/server/http";
import { dashboardStats } from "@/server/engine/admin";

export const GET = route({ auth: "staff", role: "admin", event: true }, async ({ db, event }) => dashboardStats(db, event!));
