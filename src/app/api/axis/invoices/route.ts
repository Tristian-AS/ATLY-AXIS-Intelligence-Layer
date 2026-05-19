import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { createInvoice } from "@/lib/functions/createInvoice";

export const dynamic = "force-dynamic";

export async function GET() {
  const invoices = await db.invoice.findMany({
    include: { client: { select: { id: true, name: true } } },
    orderBy: { issueDate: "desc" },
  });
  return NextResponse.json({ invoices });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const result = await createInvoice(body);
  return NextResponse.json(result, { status: 201 });
}
