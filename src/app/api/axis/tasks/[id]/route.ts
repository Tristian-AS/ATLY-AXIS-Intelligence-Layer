import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { protect } from "@/lib/auth";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export const GET = protect<{ id: string }>(async (_req, { params }) => {
  const { id } = params;
  const task = await db.task.findUnique({
    where: { id },
    include: { client: { select: { name: true } }, project: { select: { name: true } } },
  });
  if (!task) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ task });
});

export const PATCH = protect<{ id: string }>(async (req, { params, actor }) => {
  const { id } = params;
  const body = await req.json();
  const data: Record<string, unknown> = {};
  if (body.title != null) data.title = body.title;
  if (body.detail != null) data.detail = body.detail;
  if (body.status != null) {
    data.status = body.status;
    data.completedAt = body.status === "done" ? new Date() : null;
  }
  if (body.priority != null) data.priority = body.priority;
  if (body.waitingOn != null) data.waitingOn = body.waitingOn || null;
  if (body.dueDate != null) data.dueDate = body.dueDate ? new Date(body.dueDate) : null;

  const task = await db.task.update({ where: { id }, data });
  await audit({ actor, action: "api:PATCH /api/axis/tasks/[id]", target: id, payload: body });
  return NextResponse.json({ task });
});

export const DELETE = protect<{ id: string }>(async (_req, { params, actor }) => {
  const { id } = params;
  await db.task.delete({ where: { id } });
  await audit({ actor, action: "api:DELETE /api/axis/tasks/[id]", target: id });
  return NextResponse.json({ ok: true });
});
