import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/Card";
import { db } from "@/lib/prisma";
import { shortDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ContentCalendarPage() {
  const posts = await db.contentCalendarPost.findMany({
    include: {
      client: { select: { name: true } },
      campaign: { select: { name: true } },
    },
    orderBy: { scheduledFor: "asc" },
  });

  // Group by date string
  const byDate = posts.reduce<Record<string, typeof posts>>((acc, p) => {
    const key = p.scheduledFor ? shortDate(p.scheduledFor) : "Unscheduled";
    (acc[key] ??= []).push(p);
    return acc;
  }, {});

  return (
    <div>
      <PageHeader
        eyebrow="Content"
        title="The calendar."
        description="Captions, dates, platforms, approvals."
        right={
          <Link
            href={`/chat?seed=${encodeURIComponent("Generate a content calendar. Which client and how many weeks?")}`}
            className="rounded-md border border-signal-accent/40 px-4 py-2 text-xs uppercase tracking-[0.25em] text-signal-accent transition hover:bg-signal-accent/10"
          >
            Generate calendar →
          </Link>
        }
      />

      {posts.length === 0 ? (
        <Card>
          <p className="text-sm text-ink-300">No posts queued. Ask Axis to generate a calendar.</p>
        </Card>
      ) : (
        <div className="space-y-6">
          {Object.entries(byDate).map(([date, list]) => (
            <section key={date}>
              <h3 className="mb-2 text-[10px] uppercase tracking-[0.4em] text-signal-accent">
                {date}
              </h3>
              <div className="space-y-2">
                {list.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-start gap-4 rounded-md border border-ink-700/60 bg-ink-900/40 p-4"
                  >
                    <div className="w-20 shrink-0">
                      <div className="text-[10px] uppercase tracking-widest text-signal-accent">
                        {p.platform}
                      </div>
                      <div className="mt-1 text-[10px] uppercase tracking-widest text-ink-400">
                        {p.status}
                      </div>
                    </div>
                    <div className="flex-1 text-sm">
                      {p.hook ? (
                        <div className="font-display text-base text-signal">{p.hook}</div>
                      ) : null}
                      <div className="mt-1 text-ink-200">{p.caption}</div>
                      <div className="mt-2 text-[10px] uppercase tracking-widest text-ink-400">
                        {p.client.name}
                        {p.campaign ? ` · ${p.campaign.name}` : ""}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
