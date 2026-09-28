export type GameErrorCode =
  | "not_found"
  | "locked"
  | "scheduled"
  | "already_solved"
  | "event_not_live"
  | "event_paused"
  | "event_ended"
  | "rate_limited"
  | "invalid"
  | "forbidden"
  | "unauthorized"
  | "conflict"
  | "disqualified"
  | "attempts_exhausted";

const STATUS: Record<GameErrorCode, number> = {
  not_found: 404,
  locked: 403,
  scheduled: 403,
  already_solved: 409,
  event_not_live: 409,
  event_paused: 409,
  event_ended: 409,
  rate_limited: 429,
  invalid: 400,
  forbidden: 403,
  unauthorized: 401,
  conflict: 409,
  disqualified: 403,
  attempts_exhausted: 409,
};

export class GameError extends Error {
  readonly status: number;
  constructor(
    public readonly code: GameErrorCode,
    message: string,
    public readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "GameError";
    this.status = STATUS[code];
  }
}
