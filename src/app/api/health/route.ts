import { NextResponse } from "next/server";
import { db } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Unauthenticated. Used by atlystudios.ai's BFF and uptime probes.
 * Reports DB connectivity and whether per-integration env vars are configured.
 * Returns booleans only — never the values.
 */
export async function GET() {
  let dbOk = false;
  let dbError: string | undefined;
  try {
    await db.$queryRawUnsafe("SELECT 1");
    dbOk = true;
  } catch (err) {
    dbError = (err as Error).message;
  }

  const env = process.env;
  const has = (name: string) => Boolean(env[name] && env[name]!.length > 0);

  const integrations = {
    anthropic: { configured: has("ANTHROPIC_API_KEY") },
    axisToken: { configured: has("AXIS_API_TOKEN") },
    database: {
      hasDatabaseUrl: has("DATABASE_URL"),
      hasDirectUrl: has("DIRECT_URL"),
    },
    stripe: { configured: has("STRIPE_SECRET_KEY") },
    resend: {
      configured: has("RESEND_API_KEY"),
      hasFromAddress: has("AXIS_EMAIL_FROM"),
      hasReplyTo: has("AXIS_EMAIL_REPLY_TO"),
    },
    ga4: {
      configured: has("GOOGLE_SERVICE_ACCOUNT_JSON") && has("GA4_PROPERTY_ID"),
      hasServiceAccount: has("GOOGLE_SERVICE_ACCOUNT_JSON"),
      hasPropertyId: has("GA4_PROPERTY_ID"),
    },
    calendar: {
      configured: has("GOOGLE_SERVICE_ACCOUNT_JSON") && has("GOOGLE_CALENDAR_ID"),
      hasServiceAccount: has("GOOGLE_SERVICE_ACCOUNT_JSON"),
      hasCalendarId: has("GOOGLE_CALENDAR_ID"),
    },
    googleOAuth: {
      configured:
        has("GOOGLE_OAUTH_CLIENT_ID") &&
        has("GOOGLE_OAUTH_CLIENT_SECRET") &&
        has("AXIS_PUBLIC_URL"),
      hasClientId: has("GOOGLE_OAUTH_CLIENT_ID"),
      hasClientSecret: has("GOOGLE_OAUTH_CLIENT_SECRET"),
      hasPublicUrl: has("AXIS_PUBLIC_URL"),
    },
  };

  return NextResponse.json({
    ok: dbOk,
    dbOk,
    dbError,
    // legacy fields kept for older callers
    anthropicConfigured: integrations.anthropic.configured,
    tokenConfigured: integrations.axisToken.configured,
    version: "0.3.0",
    timestamp: new Date().toISOString(),
    deployment: {
      vercelEnv: env.VERCEL_ENV ?? "unknown", // "production" | "preview" | "development"
      vercelRegion: env.VERCEL_REGION ?? "unknown",
      gitCommitSha: (env.VERCEL_GIT_COMMIT_SHA ?? "unknown").slice(0, 7),
      gitBranch: env.VERCEL_GIT_COMMIT_REF ?? "unknown",
    },
    integrations,
  });
}
