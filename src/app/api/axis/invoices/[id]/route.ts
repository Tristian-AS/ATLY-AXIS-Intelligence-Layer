import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { protect } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { dollarsToCents } from "@/lib/format";

export const dynamic = "force-dynamic";

export const GET = protect<{ id: string }>(async (_req, { params }) => {
  const { id } = params;
  const invoice = await db.invoice.findUnique({
    where: { id },
    include: {
      client: { select: { id: true, name: true } },
      project: { select: { id: true, name: true } },
      payments: true,
    },
  });
  if (!invoice) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ invoice });
});

export const PATCH = protect<{ id: string }>(async (req, { params, actor }) => {
  const { id } = params;
  const body = await req.json();
  const data: Record<string, unknown> = {};
  if (body.status != null) {
    data.status = body.status;
    if (body.status === "paid") data.paidAt = new Date();
    if (body.status === "sent" && !body.dueDate) {
      // Default a sent invoice's due date to net-14 if not set.
    }
  }
  if (body.amountDollars != null) {
    const cents = dollarsToCents(body.amountDollars);
    if (cents != null) data.amountCents = cents;
  }
  if (body.dueDate != null) data.dueDate = body.dueDate ? new Date(body.dueDate) : null;
  if (body.paidAt != null) data.paidAt = body.paidAt ? new Date(body.paidAt) : null;
  if (body.notes != null) data.notes = body.notes;
  if (body.number != null) data.number = body.number;

  const invoice = await db.invoice.update({ where: { id }, data });
  await audit({ actor, action: "api:PATCH /api/axis/invoices/[id]", target: id, payload: body });
  return NextResponse.json({ invoice });
});

export const DELETE = protect<{ id: string }>(async (_req, { params, actor }) => {
  const { id } = params;
  await db.invoice.delete({ where: { id } });
  await audit({ actor, action: "api:DELETE /api/axis/invoices/[id]", target: id });
  return NextResponse.json({ ok: true });
});
