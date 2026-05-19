import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { protect } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { dollarsToCents } from "@/lib/format";

export const dynamic = "force-dynamic";

export const GET = protect<{ id: string }>(async (_req, { params }) => {
  const { id } = params;
  const project = await db.project.findUnique({
    where: { id },
    include: { client: { select: { id: true, name: true } } },
  });
  if (!project) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ project });
});

export const PATCH = protect<{ id: string }>(async (req, { params, actor }) => {
  const { id } = params;
  const body = await req.json();
  const data: Record<string, unknown> = {};
  if (body.name != null) data.name = body.name;
  if (body.status != null) data.status = body.status;
  if (body.brief != null) data.brief = body.brief;
  if (body.deliverables != null)
    data.deliverables = Array.isArray(body.deliverables)
      ? JSON.stringify(body.deliverables)
      : body.deliverables;
  if (body.budgetDollars != null) data.budgetCents = dollarsToCents(body.budgetDollars);
  if (body.startDate != null) data.startDate = body.startDate ? new Date(body.startDate) : null;
  if (body.dueDate != null) data.dueDate = body.dueDate ? new Date(body.dueDate) : null;
  if (body.risks != null) data.risks = body.risks;
  if (body.nextAction != null) data.nextAction = body.nextAction;

  const project = await db.project.update({ where: { id }, data });
  await audit({ actor, action: "api:PATCH /api/axis/projects/[id]", target: id, payload: body });
  return NextResponse.json({ project });
});

export const DELETE = protect<{ id: string }>(async (_req, { params, actor }) => {
  const { id } = params;
  await db.project.delete({ where: { id } });
  await audit({ actor, action: "api:DELETE /api/axis/projects/[id]", target: id });
  return NextResponse.json({ ok: true });
});
