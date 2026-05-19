import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get("clientId");
  const snapshots = await db.analyticsSnapshot.findMany({
    where: clientId ? { clientId } : undefined,
    orderBy: { capturedAt: "desc" },
    take: 100,
  });
  return NextResponse.json({ snapshots });
}

export async function POST(req: NextRequest) {
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
  return NextResponse.json({ snapshot: snap }, { status: 201 });
}
