import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { protect } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { dollarsToCents } from "@/lib/format";

export const dynamic = "force-dynamic";

export const GET = protect<{ id: string }>(async (_req, { params }) => {
  const { id } = params;
  const expense = await db.expense.findUnique({ where: { id } });
  if (!expense) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ expense });
});

export const PATCH = protect<{ id: string }>(async (req, { params, actor }) => {
  const { id } = params;
  const body = await req.json();
  const data: Record<string, unknown> = {};
  if (body.vendor != null) data.vendor = body.vendor;
  if (body.category != null) data.category = body.category;
  if (body.amountDollars != null) {
    const cents = dollarsToCents(body.amountDollars);
    if (cents != null) data.amountCents = cents;
  }
  if (body.occurredAt != null)
    data.occurredAt = body.occurredAt ? new Date(body.occurredAt) : null;
  if (body.notes != null) data.notes = body.notes;
  if (body.taxDeductible != null) data.taxDeductible = body.taxDeductible;

  const expense = await db.expense.update({ where: { id }, data });
  await audit({ actor, action: "api:PATCH /api/axis/expenses/[id]", target: id, payload: body });
  return NextResponse.json({ expense });
});

export const DELETE = protect<{ id: string }>(async (_req, { params, actor }) => {
  const { id } = params;
  await db.expense.delete({ where: { id } });
  await audit({ actor, action: "api:DELETE /api/axis/expenses/[id]", target: id });
  return NextResponse.json({ ok: true });
});
