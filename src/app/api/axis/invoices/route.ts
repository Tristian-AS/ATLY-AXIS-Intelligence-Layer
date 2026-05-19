import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { createInvoice } from "@/lib/functions/createInvoice";
import { protect } from "@/lib/auth";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export const GET = protect(async () => {
  const invoices = await db.invoice.findMany({
    include: { client: { select: { id: true, name: true } } },
    orderBy: { issueDate: "desc" },
  });
  return NextResponse.json({ invoices });
});

export const POST = protect(async (req: NextRequest, { actor }) => {
  const body = await req.json();
  const result = await createInvoice(body);
  await audit({
    actor,
    action: "api:POST /api/axis/invoices",
    target: result.invoice.id,
    payload: body,
  });
  return NextResponse.json(result, { status: 201 });
});
