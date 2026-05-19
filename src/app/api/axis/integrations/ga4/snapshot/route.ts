import { NextRequest, NextResponse } from "next/server";
import { protect } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { ga4Snapshot } from "@/lib/integrations/ga4";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const GET = protect(async (req: NextRequest, { actor }) => {
  const sp = req.nextUrl.searchParams;
  const result = await ga4Snapshot({
    propertyId: sp.get("propertyId") ?? undefined,
    startDate: sp.get("startDate") ?? undefined,
    endDate: sp.get("endDate") ?? undefined,
    persist: sp.get("persist") === "1",
  });
  if (result.snapshotId) {
    await audit({
      actor,
      action: "api:GET /api/axis/integrations/ga4/snapshot",
      target: result.snapshotId,
      payload: { dateRange: result.dateRange, totals: result.totals },
    });
  }
  return NextResponse.json(result);
});
