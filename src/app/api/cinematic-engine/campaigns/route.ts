import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Cinematic Growth Engine — client-facing campaign objects.
 * Surfaces only the parts of an Axis campaign that should be visible to a client.
 */
export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get("clientId");
  const campaigns = await db.campaign.findMany({
    where: {
      ...(clientId ? { clientId } : {}),
      status: { in: ["live", "wrapped"] },
    },
    include: { client: { select: { id: true, name: true, handle: true } } },
    orderBy: { startDate: "desc" },
  });

  return NextResponse.json({
    campaigns: campaigns.map((c) => ({
      id: c.id,
      client: c.client,
      name: c.name,
      concept: c.concept,
      heroDirection: c.heroDirection,
      hooks: c.hooks?.split("\n").filter(Boolean) ?? [],
      goals: c.goals,
      status: c.status,
      window: { start: c.startDate, end: c.endDate },
    })),
  });
}
