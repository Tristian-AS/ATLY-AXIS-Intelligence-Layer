import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get("status");
  const tasks = await db.task.findMany({
    where: status ? { status } : { status: { not: "done" } },
    include: { client: { select: { name: true } }, project: { select: { name: true } } },
    orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
  });
  return NextResponse.json({ tasks });
}

export async function POST(req: NextRequest) {
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
  return NextResponse.json({ task }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const task = await db.task.update({
    where: { id: body.id },
    data: {
      status: body.status,
      completedAt: body.status === "done" ? new Date() : null,
    },
  });
  return NextResponse.json({ task });
}
