#!/usr/bin/env node
/**
 * Build wrapper for Axis.
 *
 * Why this exists:
 *   The Prisma schema declares both `url = env("DATABASE_URL")` and
 *   `directUrl = env("DIRECT_URL")`. Prisma errors at schema validation if
 *   the referenced env var is missing — even on the simplest deployments
 *   where the operator only has one connection string.
 *
 *   This wrapper makes `DIRECT_URL` optional: if it's not set, we default it
 *   to `DATABASE_URL` so Prisma migrate + generate succeed against a single
 *   URL. When the operator later splits pooled vs direct URLs on Neon,
 *   setting `DIRECT_URL` explicitly takes precedence and unlocks proper
 *   pgbouncer-aware migrations.
 *
 * Runs:
 *   1. prisma generate
 *   2. prisma migrate deploy
 *   3. next build
 */
import { spawnSync } from "node:child_process";

if (!process.env.DATABASE_URL) {
  console.error("[axis-build] DATABASE_URL is required.");
  process.exit(1);
}

if (!process.env.DIRECT_URL) {
  const derived = deriveDirectUrl(process.env.DATABASE_URL);
  process.env.DIRECT_URL = derived;
  if (derived !== process.env.DATABASE_URL) {
    console.log(
      "[axis-build] DIRECT_URL not set; derived from DATABASE_URL by stripping " +
        "pooler host + pgbouncer flag. For cleanest behavior, set DIRECT_URL " +
        "explicitly in Vercel env vars (Neon's 'Direct connection' string)."
    );
  } else {
    console.log(
      "[axis-build] DIRECT_URL not set; defaulting to DATABASE_URL (no pooler " +
        "host detected). If this is a Neon pooled URL, set DIRECT_URL explicitly."
    );
  }
}

/**
 * Neon pooled URL → direct URL:
 *   host:  ep-xxx-pooler.region.aws.neon.tech  →  ep-xxx.region.aws.neon.tech
 *   query: drops pgbouncer=true
 * Prisma's migrate engine uses Postgres advisory locks, which pgbouncer's
 * transaction-pooling mode does not support — running migrations through
 * the pooled URL deadlocks with P1002 advisory-lock timeouts.
 */
function deriveDirectUrl(pooledUrl) {
  try {
    const url = new URL(pooledUrl);
    if (!url.hostname.includes("-pooler.") && !url.searchParams.has("pgbouncer")) {
      // Already direct.
      return pooledUrl;
    }
    url.hostname = url.hostname.replace(/-pooler\./, ".");
    url.searchParams.delete("pgbouncer");
    return url.toString();
  } catch {
    return pooledUrl;
  }
}

const SKIP_MIGRATE = process.argv.includes("--no-migrate");

const steps = [
  ["npx", ["prisma", "generate"]],
  ...(SKIP_MIGRATE ? [] : [["npx", ["prisma", "migrate", "deploy"]]]),
  ["npx", ["next", "build"]],
];

for (const [cmd, args] of steps) {
  console.log(`[axis-build] ${cmd} ${args.join(" ")}`);
  const r = spawnSync(cmd, args, { stdio: "inherit", env: process.env });
  if (r.status !== 0) {
    console.error(`[axis-build] step failed (exit ${r.status}): ${cmd} ${args.join(" ")}`);
    process.exit(r.status ?? 1);
  }
}

console.log("[axis-build] done.");
