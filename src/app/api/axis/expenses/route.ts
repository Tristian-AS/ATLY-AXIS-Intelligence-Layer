import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { dollarsToCents } from "@/lib/format";

export const dynamic = "force-dynamic";

export async function GET() {
  const expenses = await db.expense.findMany({ orderBy: { occurredAt: "desc" }, take: 200 });
  return NextResponse.json({ expenses });
}

export async function POST(req: NextRequest) {
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
  return NextResponse.json({ expense }, { status: 201 });
}
