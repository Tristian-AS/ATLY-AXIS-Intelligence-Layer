import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { protect } from "@/lib/auth";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export const GET = protect(async (req: NextRequest) => {
  const status = req.nextUrl.searchParams.get("status");
  const tasks = await db.task.findMany({
    where: status ? { status } : { status: { not: "done" } },
    include: { client: { select: { name: true } }, project: { select: { name: true } } },
    orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
  });
  return NextResponse.json({ tasks });
});

export const POST = protect(async (req: NextRequest, { actor }) => {
  const body = await req.json();
  const task = await db.task.create({
    data: {
      title: body.title,
      detail: body.detail,
      clientId: body.clientId,
      projectId: body.projectId,
      priority: body.priority ?? "normal",
      waitingOn: body.waitingOn,
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
    },
  });
  await audit({
    actor,
    action: "api:POST /api/axis/tasks",
    target: task.id,
    payload: body,
  });
  return NextResponse.json({ task }, { status: 201 });
});

export const PATCH = protect(async (req: NextRequest, { actor }) => {
  const body = await req.json();
  const task = await db.task.update({
    where: { id: body.id },
    data: {
      status: body.status,
      completedAt: body.status === "done" ? new Date() : null,
    },
  });
  await audit({
    actor,
    action: "api:PATCH /api/axis/tasks",
    target: body.id,
    payload: body,
  });
  return NextResponse.json({ task });
});
