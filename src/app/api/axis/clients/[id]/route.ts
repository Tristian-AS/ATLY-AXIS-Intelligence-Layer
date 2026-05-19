import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const client = await db.client.update({ where: { id }, data: body });
  return NextResponse.json({ client });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await db.client.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
