import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { protect } from "@/lib/auth";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export const GET = protect<{ id: string }>(async (_req, { params }) => {
  const { id } = params;
  const campaign = await db.campaign.findUnique({
    where: { id },
    include: { client: { select: { id: true, name: true } } },
  });
  if (!campaign) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ campaign });
});

export const PATCH = protect<{ id: string }>(async (req, { params, actor }) => {
  const { id } = params;
  const body = await req.json();
  const data: Record<string, unknown> = {};
  if (body.name != null) data.name = body.name;
  if (body.concept != null) data.concept = body.concept;
  if (body.heroDirection != null) data.heroDirection = body.heroDirection;
  if (body.hooks != null) data.hooks = Array.isArray(body.hooks) ? body.hooks.join("\n") : body.hooks;
  if (body.goals != null) data.goals = body.goals;
  if (body.status != null) data.status = body.status;
  if (body.startDate != null) data.startDate = body.startDate ? new Date(body.startDate) : null;
  if (body.endDate != null) data.endDate = body.endDate ? new Date(body.endDate) : null;

  const campaign = await db.campaign.update({ where: { id }, data });
  await audit({ actor, action: "api:PATCH /api/axis/campaigns/[id]", target: id, payload: body });
  return NextResponse.json({ campaign });
});

export const DELETE = protect<{ id: string }>(async (_req, { params, actor }) => {
  const { id } = params;
  await db.campaign.delete({ where: { id } });
  await audit({ actor, action: "api:DELETE /api/axis/campaigns/[id]", target: id });
  return NextResponse.json({ ok: true });
});
