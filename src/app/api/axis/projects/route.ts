import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { createProject } from "@/lib/functions/createProject";
import { protect } from "@/lib/auth";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export const GET = protect(async (req: NextRequest) => {
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
});

export const POST = protect(async (req: NextRequest, { actor }) => {
  const body = await req.json();
  const result = await createProject(body);
  await audit({
    actor,
    action: "api:POST /api/axis/projects",
    target: result.project.id,
    payload: body,
  });
  return NextResponse.json(result, { status: 201 });
});
