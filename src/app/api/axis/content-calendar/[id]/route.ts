import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { protect } from "@/lib/auth";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export const GET = protect<{ id: string }>(async (_req, { params }) => {
  const { id } = params;
  const post = await db.contentCalendarPost.findUnique({
    where: { id },
    include: { client: { select: { name: true } }, campaign: { select: { name: true } } },
  });
  if (!post) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ post });
});

export const PATCH = protect<{ id: string }>(async (req, { params, actor }) => {
  const { id } = params;
  const body = await req.json();
  const data: Record<string, unknown> = {};
  if (body.platform != null) data.platform = body.platform;
  if (body.caption != null) data.caption = body.caption;
  if (body.hook != null) data.hook = body.hook;
  if (body.status != null) data.status = body.status;
  if (body.scheduledFor != null)
    data.scheduledFor = body.scheduledFor ? new Date(body.scheduledFor) : null;
  if (body.approvedBy != null) data.approvedBy = body.approvedBy;
  if (body.postedUrl != null) data.postedUrl = body.postedUrl;

  const post = await db.contentCalendarPost.update({ where: { id }, data });
  await audit({
    actor,
    action: "api:PATCH /api/axis/content-calendar/[id]",
    target: id,
    payload: body,
  });
  return NextResponse.json({ post });
});

export const DELETE = protect<{ id: string }>(async (_req, { params, actor }) => {
  const { id } = params;
  await db.contentCalendarPost.delete({ where: { id } });
  await audit({ actor, action: "api:DELETE /api/axis/content-calendar/[id]", target: id });
  return NextResponse.json({ ok: true });
});
