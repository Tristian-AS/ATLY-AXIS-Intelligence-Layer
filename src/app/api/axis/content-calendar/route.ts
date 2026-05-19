import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { generateContentCalendar } from "@/lib/functions/generateContentCalendar";
import { protect } from "@/lib/auth";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export const GET = protect(async (req: NextRequest) => {
  const clientId = req.nextUrl.searchParams.get("clientId");
  const posts = await db.contentCalendarPost.findMany({
    where: clientId ? { clientId } : undefined,
    include: { client: { select: { name: true } }, campaign: { select: { name: true } } },
    orderBy: { scheduledFor: "asc" },
    take: 200,
  });
  return NextResponse.json({ posts });
});

export const POST = protect(async (req: NextRequest, { actor }) => {
  const body = await req.json();
  if (body.action === "generate") {
    const result = await generateContentCalendar(body);
    await audit({
      actor,
      action: "api:POST /api/axis/content-calendar (generate)",
      payload: body,
    });
    return NextResponse.json(result, { status: 201 });
  }
  const post = await db.contentCalendarPost.create({ data: body });
  await audit({
    actor,
    action: "api:POST /api/axis/content-calendar",
    target: post.id,
    payload: body,
  });
  return NextResponse.json({ post }, { status: 201 });
});
