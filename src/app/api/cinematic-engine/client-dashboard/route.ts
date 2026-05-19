import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Cinematic Growth Engine — single endpoint a client-facing dashboard can hit
 * to render everything ATLY is doing for them right now.
 */
export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get("clientId");
  if (!clientId) return NextResponse.json({ error: "clientId required" }, { status: 400 });

  const [client, projects, campaigns, posts, snapshots] = await Promise.all([
    db.client.findUnique({
      where: { id: clientId },
      select: { id: true, name: true, handle: true, industry: true, stage: true },
    }),
    db.project.findMany({
      where: { clientId, status: { in: ["active", "stalled"] } },
      select: { id: true, name: true, status: true, dueDate: true, nextAction: true, deliverables: true },
    }),
    db.campaign.findMany({
      where: { clientId, status: { in: ["live", "draft"] } },
      select: { id: true, name: true, status: true, concept: true, heroDirection: true, hooks: true },
    }),
    db.contentCalendarPost.findMany({
      where: { clientId, scheduledFor: { gte: new Date() } },
      orderBy: { scheduledFor: "asc" },
      take: 20,
      select: { id: true, platform: true, hook: true, scheduledFor: true, status: true },
    }),
    db.analyticsSnapshot.findMany({
      where: { clientId },
      orderBy: { capturedAt: "desc" },
      take: 10,
    }),
  ]);

  if (!client) return NextResponse.json({ error: "not found" }, { status: 404 });

  return NextResponse.json({
    client,
    projects: projects.map((p) => ({
      ...p,
      deliverables: p.deliverables ? JSON.parse(p.deliverables) : [],
    })),
    campaigns: campaigns.map((c) => ({
      ...c,
      hooks: c.hooks?.split("\n").filter(Boolean) ?? [],
    })),
    upcomingPosts: posts,
    analytics: snapshots.map((s) => ({
      id: s.id,
      platform: s.platform,
      capturedAt: s.capturedAt,
      metrics: (() => {
        try {
          return JSON.parse(s.metrics);
        } catch {
          return s.metrics;
        }
      })(),
    })),
  });
}
