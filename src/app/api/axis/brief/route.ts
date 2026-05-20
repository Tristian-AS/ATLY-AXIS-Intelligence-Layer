import { NextRequest, NextResponse } from "next/server";
import { protect } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { dailyBrief } from "@/lib/functions/dailyBrief";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * One-shot daily brief — call from the Lovable UI for the morning dashboard,
 * from Claude Code, or from a Vercel cron.
 *
 * GET /api/axis/brief?inboxHours=24&calendarDays=7&persist=1&skip=stripe,ga4
 */
export const GET = protect(async (req: NextRequest, { actor }) => {
  const sp = req.nextUrl.searchParams;
  const brief = await dailyBrief({
    inboxHours: sp.get("inboxHours") ? Number(sp.get("inboxHours")) : undefined,
    calendarDays: sp.get("calendarDays") ? Number(sp.get("calendarDays")) : undefined,
    persist: sp.get("persist") === "1",
    skip: sp.get("skip")
      ? ((sp.get("skip") as string).split(",") as NonNullable<Parameters<typeof dailyBrief>[0]>["skip"])
      : undefined,
  });
  await audit({
    actor,
    action: "api:GET /api/axis/brief",
    payload: { summary: brief.summary },
  });
  return NextResponse.json(brief);
});
