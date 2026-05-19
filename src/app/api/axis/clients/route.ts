import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { createClient } from "@/lib/functions/createClient";

export const dynamic = "force-dynamic";

export async function GET() {
  const clients = await db.client.findMany({
    orderBy: [{ stage: "asc" }, { name: "asc" }],
    include: { _count: { select: { projects: true, invoices: true } } },
  });
  return NextResponse.json({ clients });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const result = await createClient(body);
  return NextResponse.json(result, { status: 201 });
}
