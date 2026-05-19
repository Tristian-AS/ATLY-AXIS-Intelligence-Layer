import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { protect } from "@/lib/auth";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export const GET = protect<{ id: string }>(async (_req, { params }) => {
  const { id } = params;
  const client = await db.client.findUnique({
    where: { id },
    include: {
      contacts: true,
      projects: { orderBy: { updatedAt: "desc" } },
      campaigns: { orderBy: { updatedAt: "desc" } },
      invoices: { orderBy: { issueDate: "desc" } },
      notes: { orderBy: { createdAt: "desc" } },
      tasks: { where: { status: { not: "done" } }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!client) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ client });
});

export const PATCH = protect<{ id: string }>(async (req, { params, actor }) => {
  const { id } = params;
  const body = await req.json();
  const client = await db.client.update({ where: { id }, data: body });
  await audit({ actor, action: "api:PATCH /api/axis/clients/[id]", target: id, payload: body });
  return NextResponse.json({ client });
});

export const DELETE = protect<{ id: string }>(async (_req, { params, actor }) => {
  const { id } = params;
  await db.client.delete({ where: { id } });
  await audit({ actor, action: "api:DELETE /api/axis/clients/[id]", target: id });
  return NextResponse.json({ ok: true });
});
