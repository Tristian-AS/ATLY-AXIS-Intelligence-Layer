import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { generateContentCalendar } from "@/lib/functions/generateContentCalendar";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get("clientId");
  const posts = await db.contentCalendarPost.findMany({
    where: clientId ? { clientId } : undefined,
    include: { client: { select: { name: true } }, campaign: { select: { name: true } } },
    orderBy: { scheduledFor: "asc" },
    take: 200,
  });
  return NextResponse.json({ posts });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (body.action === "generate") {
    const result = await generateContentCalendar(body);
    return NextResponse.json(result, { status: 201 });
  }
  const post = await db.contentCalendarPost.create({ data: body });
  return NextResponse.json({ post }, { status: 201 });
}
