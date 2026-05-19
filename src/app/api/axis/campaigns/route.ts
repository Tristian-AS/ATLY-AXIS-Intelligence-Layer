import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { createCampaign } from "@/lib/functions/createCampaign";
import { generateCampaignPlan } from "@/lib/functions/generateCampaignPlan";

export const dynamic = "force-dynamic";

export async function GET() {
  const campaigns = await db.campaign.findMany({
    include: { client: { select: { id: true, name: true } } },
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json({ campaigns });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (body.action === "generate") {
    const plan = await generateCampaignPlan(body);
    return NextResponse.json(plan, { status: 201 });
  }
  const created = await createCampaign(body);
  return NextResponse.json(created, { status: 201 });
}
