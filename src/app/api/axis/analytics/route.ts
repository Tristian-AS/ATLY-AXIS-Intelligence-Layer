import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { protect } from "@/lib/auth";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export const GET = protect(async (req: NextRequest) => {
  const clientId = req.nextUrl.searchParams.get("clientId");
  const snapshots = await db.analyticsSnapshot.findMany({
    where: clientId ? { clientId } : undefined,
    orderBy: { capturedAt: "desc" },
    take: 100,
  });
  return NextResponse.json({ snapshots });
});

export const POST = protect(async (req: NextRequest, { actor }) => {
  const body = await req.json();
  const snap = await db.analyticsSnapshot.create({
    data: {
      clientId: body.clientId,
      campaignId: body.campaignId,
      platform: body.platform,
      metrics: typeof body.metrics === "string" ? body.metrics : JSON.stringify(body.metrics),
      source: body.source ?? "manual",
    },
  });
  await audit({
    actor,
    action: "api:POST /api/axis/analytics",
    target: snap.id,
    payload: body,
  });
  return NextResponse.json({ snapshot: snap }, { status: 201 });
});
