import { z } from "zod";

const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

const loopbackUrl = (field: string) =>
  z.url().refine((value) => LOOPBACK_HOSTNAMES.has(new URL(value).hostname), {
    message: `${field} must point to a loopback host`,
  });

const csvList = z.string().transform((value) =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean),
);

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().min(1).default("127.0.0.1"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),

  API_AUTH_TOKEN: z.string().min(16),
  DEV_PUUID: z.string().min(1).optional(),
  CORS_ORIGINS: csvList.prefault("http://localhost:4200"),

  DATABASE_URL: z.url().optional(),
  RIOT_API_KEY: z.string().min(1).optional(),
  // Riot shard labels only — a route containing URL-significant chars would
  // redirect requests (and the X-Riot-Token header) to a different host.
  RIOT_REGIONAL_ROUTE: z
    .string()
    .regex(/^[a-z0-9]+$/)
    .default("europe"),
  RIOT_PLATFORM_ROUTE: z
    .string()
    .regex(/^[a-z0-9]+$/)
    .default("euw1"),

  OLLAMA_BASE_URL: loopbackUrl("OLLAMA_BASE_URL").default("http://localhost:11434"),
  OLLAMA_THINK: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  JOB_RETENTION_DAYS: z.coerce.number().int().min(1).default(30),
  SENTRY_DSN: z.url().optional(),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  return envSchema.parse(config);
}
