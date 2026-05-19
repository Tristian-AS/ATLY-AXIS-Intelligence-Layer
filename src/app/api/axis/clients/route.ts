import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { createClient } from "@/lib/functions/createClient";
import { protect } from "@/lib/auth";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export const GET = protect(async () => {
  const clients = await db.client.findMany({
    orderBy: [{ stage: "asc" }, { name: "asc" }],
    include: { _count: { select: { projects: true, invoices: true } } },
  });
  return NextResponse.json({ clients });
});

export const POST = protect(async (req: NextRequest, { actor }) => {
  const body = await req.json();
  const result = await createClient(body);
  await audit({
    actor,
    action: "api:POST /api/axis/clients",
    target: result.client.id,
    payload: body,
  });
  return NextResponse.json(result, { status: 201 });
});
