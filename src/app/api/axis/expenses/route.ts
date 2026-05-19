import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { dollarsToCents } from "@/lib/format";
import { protect } from "@/lib/auth";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export const GET = protect(async () => {
  const expenses = await db.expense.findMany({ orderBy: { occurredAt: "desc" }, take: 200 });
  return NextResponse.json({ expenses });
});

export const POST = protect(async (req: NextRequest, { actor }) => {
  const body = await req.json();
  const expense = await db.expense.create({
    data: {
      vendor: body.vendor,
      category: body.category ?? "other",
      amountCents: dollarsToCents(body.amountDollars) ?? 0,
      occurredAt: body.occurredAt ? new Date(body.occurredAt) : new Date(),
      notes: body.notes,
      receiptUrl: body.receiptUrl,
      taxDeductible: body.taxDeductible ?? true,
    },
  });
  await audit({
    actor,
    action: "api:POST /api/axis/expenses",
    target: expense.id,
    payload: body,
  });
  return NextResponse.json({ expense }, { status: 201 });
});
