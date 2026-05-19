import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { createCampaign } from "@/lib/functions/createCampaign";
import { generateCampaignPlan } from "@/lib/functions/generateCampaignPlan";
import { protect } from "@/lib/auth";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export const GET = protect(async () => {
  const campaigns = await db.campaign.findMany({
    include: { client: { select: { id: true, name: true } } },
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json({ campaigns });
});

export const POST = protect(async (req: NextRequest, { actor }) => {
  const body = await req.json();
  if (body.action === "generate") {
    const plan = await generateCampaignPlan(body);
    await audit({ actor, action: "api:POST /api/axis/campaigns (generate)", payload: body });
    return NextResponse.json(plan, { status: 201 });
  }
  const created = await createCampaign(body);
  await audit({
    actor,
    action: "api:POST /api/axis/campaigns",
    target: created.campaign.id,
    payload: body,
  });
  return NextResponse.json(created, { status: 201 });
});
