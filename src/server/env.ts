import { z } from "zod";

/**
 * Environment validation. Every secret comes from the environment only.
 * In production we refuse to boot when a secret is missing, too short, or a
 * known placeholder — a misconfigured fest server must fail loudly, not
 * silently sign tokens with "changeme".
 */

const PLACEHOLDER_PATTERNS = [/^change-?me/i, /^secret$/i, /^password$/i, /^dev-/i, /^test-/i, /^x+$/i, /placeholder/i];

export function isWeakSecret(value: string | undefined): boolean {
  if (!value) return true;
  if (value.length < 32) return true;
  if (new Set(value).size < 8) return true;
  return PLACEHOLDER_PATTERNS.some((re) => re.test(value));
}

const boolish = z
  .union([z.boolean(), z.string()])
  .optional()
  .transform((v) => v === true || v === "true" || v === "1");

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL is required")
    .refine((v) => /^(postgres(ql)?:\/\/|pglite:\/\/|memory:\/\/)/.test(v), "DATABASE_URL must be postgres://, pglite:// or memory://"),
  APP_URL: z.url().default("http://localhost:3000"),
  SESSION_SECRET: z.string().min(1, "SESSION_SECRET is required"),
  ANSWER_SECRET: z.string().min(1, "ANSWER_SECRET is required"),
  TOKEN_SECRET: z.string().min(1, "TOKEN_SECRET is required"),
  ACTIVE_PACK: z.string().optional(),
  PACKS_DIR: z.string().default("packs"),
  TRUST_PROXY: boolish,
  DEV_UI: boolish,
});

export type Env = z.infer<typeof EnvSchema>;

export class EnvError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Invalid environment:\n  - ${problems.join("\n  - ")}`);
    this.name = "EnvError";
  }
}

export function parseEnv(source: Record<string, string | undefined>): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    throw new EnvError(parsed.error.issues.map((i) => `${i.path.join(".") || "env"}: ${i.message}`));
  }
  const env = parsed.data;
  if (env.NODE_ENV === "production") {
    const problems: string[] = [];
    for (const key of ["SESSION_SECRET", "ANSWER_SECRET", "TOKEN_SECRET"] as const) {
      if (isWeakSecret(env[key])) problems.push(`${key} must be a random value of at least 32 characters (not a placeholder)`);
    }
    const secrets = [env.SESSION_SECRET, env.ANSWER_SECRET, env.TOKEN_SECRET];
    if (new Set(secrets).size !== secrets.length) problems.push("SESSION_SECRET, ANSWER_SECRET and TOKEN_SECRET must all differ");
    if (env.DATABASE_URL.startsWith("memory://")) problems.push("DATABASE_URL memory:// is not allowed in production");
    if (problems.length) throw new EnvError(problems);
  }
  return env;
}

let cached: Env | null = null;

/** Lazily validated env. During `next build` (DOSSIER_BUILD=1) placeholders are tolerated. */
export function env(): Env {
  if (cached) return cached;
  if (process.env.DOSSIER_BUILD === "1") {
    cached = parseEnv({
      ...process.env,
      NODE_ENV: "development",
      DATABASE_URL: process.env.DATABASE_URL ?? "memory://build",
      SESSION_SECRET: process.env.SESSION_SECRET ?? "build-placeholder",
      ANSWER_SECRET: process.env.ANSWER_SECRET ?? "build-placeholder",
      TOKEN_SECRET: process.env.TOKEN_SECRET ?? "build-placeholder",
    });
    return cached;
  }
  cached = parseEnv(process.env);
  return cached;
}

/** Test hook. */
export function resetEnvCache() {
  cached = null;
}
