import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/Card";
import { db } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function CampaignsPage() {
  const campaigns = await db.campaign.findMany({
    include: { client: { select: { name: true } } },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div>
      <PageHeader
        eyebrow="Campaigns"
        title="The cinematic engine."
        description="Concepts, hooks, hero direction, goals. Push these into the Cinematic Growth Engine when they're live."
        right={
          <Link
            href={`/chat?seed=${encodeURIComponent("Generate a campaign plan. Which client and what's the goal?")}`}
            className="rounded-md border border-signal-accent/40 px-4 py-2 text-xs uppercase tracking-[0.25em] text-signal-accent transition hover:bg-signal-accent/10"
          >
            Generate plan →
          </Link>
        }
      />

      {campaigns.length === 0 ? (
        <Card>
          <p className="text-sm text-ink-300">No campaigns yet. Ask Axis to generate one.</p>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {campaigns.map((c) => {
            const hooks = c.hooks?.split("\n").filter(Boolean) ?? [];
            return (
              <Card key={c.id} className="!p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.35em] text-signal-accent">
                      {c.client.name}
                    </div>
                    <div className="font-display text-xl text-signal">{c.name}</div>
                  </div>
                  <span className="rounded border border-ink-700/60 px-2 py-0.5 text-[10px] uppercase tracking-widest text-ink-300">
                    {c.status}
                  </span>
                </div>

                {c.concept ? (
                  <p className="mt-4 text-sm leading-relaxed text-ink-100">{c.concept}</p>
                ) : null}

                {c.heroDirection ? (
                  <div className="mt-4">
                    <div className="text-[10px] uppercase tracking-[0.3em] text-ink-400">
                      Hero direction
                    </div>
                    <p className="mt-1 text-sm italic text-ink-200">{c.heroDirection}</p>
                  </div>
                ) : null}

                {hooks.length > 0 ? (
                  <div className="mt-4">
                    <div className="text-[10px] uppercase tracking-[0.3em] text-ink-400">
                      Hooks
                    </div>
                    <ul className="mt-2 space-y-1">
                      {hooks.map((h, i) => (
                        <li key={i} className="text-sm text-signal">— {h}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {c.goals ? (
                  <div className="mt-4 rounded border atly-hairline bg-ink-950/40 p-3">
                    <div className="text-[10px] uppercase tracking-[0.3em] text-ink-400">Goals</div>
                    <p className="mt-1 text-xs text-ink-200">{c.goals}</p>
                  </div>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
