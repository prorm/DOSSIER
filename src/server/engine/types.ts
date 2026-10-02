import type { challenges, events, teams } from "../db/schema";

export type EventRow = typeof events.$inferSelect;
export type ChallengeRow = typeof challenges.$inferSelect;
export type TeamRow = typeof teams.$inferSelect;
