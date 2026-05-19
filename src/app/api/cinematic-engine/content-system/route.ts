import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { protect } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const GET = protect(async (req: NextRequest) => {
  const clientId = req.nextUrl.searchParams.get("clientId");
  if (!clientId) return NextResponse.json({ error: "clientId required" }, { status: 400 });

  const posts = await db.contentCalendarPost.findMany({
    where: { clientId, status: { in: ["approved", "scheduled", "posted"] } },
    orderBy: { scheduledFor: "asc" },
    include: { campaign: { select: { name: true } } },
    take: 100,
  });

  return NextResponse.json({
    posts: posts.map((p) => ({
      id: p.id,
      platform: p.platform,
      hook: p.hook,
      caption: p.caption,
      scheduledFor: p.scheduledFor,
      status: p.status,
      campaign: p.campaign?.name ?? null,
      postedUrl: p.postedUrl,
    })),
  });
});
