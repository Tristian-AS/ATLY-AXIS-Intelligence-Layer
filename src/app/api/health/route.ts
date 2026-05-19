import { NextResponse } from "next/server";
import { db } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Unauthenticated. Used by atlystudios.ai's BFF and uptime probes.
 * Reports DB connectivity and whether the Anthropic key is configured —
 * not the key itself, never the value.
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

  return NextResponse.json({
    ok: dbOk,
    dbOk,
    dbError,
    anthropicConfigured: !!process.env.ANTHROPIC_API_KEY,
    tokenConfigured: !!process.env.AXIS_API_TOKEN,
    version: "0.2.0",
    timestamp: new Date().toISOString(),
  });
}
