import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { createProject } from "@/lib/functions/createProject";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get("status");
  const clientId = req.nextUrl.searchParams.get("clientId");
  const projects = await db.project.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(clientId ? { clientId } : {}),
    },
    include: { client: { select: { id: true, name: true } } },
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json({ projects });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const result = await createProject(body);
  return NextResponse.json(result, { status: 201 });
}
