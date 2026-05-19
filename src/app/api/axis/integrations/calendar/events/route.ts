import { NextRequest, NextResponse } from "next/server";
import { protect } from "@/lib/auth";
import { listCalendarEvents } from "@/lib/integrations/google-calendar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = protect(async (req: NextRequest) => {
  const sp = req.nextUrl.searchParams;
  const events = await listCalendarEvents({
    calendarId: sp.get("calendarId") ?? undefined,
    timeMin: sp.get("timeMin") ?? undefined,
    timeMax: sp.get("timeMax") ?? undefined,
    maxResults: sp.get("maxResults") ? parseInt(sp.get("maxResults") as string, 10) : undefined,
    q: sp.get("q") ?? undefined,
  });
  return NextResponse.json({ events });
});
