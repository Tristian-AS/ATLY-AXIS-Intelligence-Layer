import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/Card";
import { db } from "@/lib/prisma";
import { money } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const clients = await db.client.findMany({
    orderBy: [{ stage: "asc" }, { name: "asc" }],
    include: {
      _count: { select: { projects: true, invoices: true, campaigns: true } },
    },
  });

  const grouped = clients.reduce<Record<string, typeof clients>>((acc, c) => {
    (acc[c.stage] ??= []).push(c);
    return acc;
  }, {});
  const ordered = ["active", "lead", "paused", "churned"];

  return (
    <div>
      <PageHeader
        eyebrow="Clients"
        title="The roster."
        description="Brand notes, payment status, contacts, linked projects, next actions."
        right={
          <Link
            href={`/chat?seed=${encodeURIComponent("Create a new client. Ask me for the details.")}`}
            className="rounded-md border border-signal-accent/40 px-4 py-2 text-xs uppercase tracking-[0.25em] text-signal-accent transition hover:bg-signal-accent/10"
          >
            New client →
          </Link>
        }
      />

      {clients.length === 0 ? (
        <Card>
          <p className="text-sm text-ink-300">
            No clients yet. Open Axis and tell it about your first one.
          </p>
        </Card>
      ) : (
        <div className="space-y-8">
          {ordered.map((stage) => {
            const list = grouped[stage];
            if (!list?.length) return null;
            return (
              <section key={stage}>
                <h3 className="mb-3 text-[10px] uppercase tracking-[0.4em] text-signal-accent">
                  {stage} · {list.length}
                </h3>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {list.map((c) => (
                    <Card key={c.id} className="!p-5">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="font-display text-lg text-signal">{c.name}</div>
                          {c.handle ? (
                            <div className="text-xs text-ink-400">{c.handle}</div>
                          ) : null}
                        </div>
                        <span className="text-[10px] uppercase tracking-widest text-ink-400">
                          {c.industry ?? ""}
                        </span>
                      </div>
                      {c.brandNotes ? (
                        <p className="mt-3 line-clamp-3 text-xs leading-relaxed text-ink-300">
                          {c.brandNotes}
                        </p>
                      ) : null}
                      {c.nextAction ? (
                        <p className="mt-3 text-xs text-signal-accent">
                          Next · {c.nextAction}
                        </p>
                      ) : null}
                      <div className="mt-4 flex items-center justify-between border-t atly-hairline pt-3 text-[10px] uppercase tracking-widest text-ink-400">
                        <span>
                          {c._count.projects}p · {c._count.campaigns}c · {c._count.invoices}i
                        </span>
                        <span className="text-signal">
                          {c.retainerCents ? `${money(c.retainerCents)}/mo` : ""}
                        </span>
                      </div>
                    </Card>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
