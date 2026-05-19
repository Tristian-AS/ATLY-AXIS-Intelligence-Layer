import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { Card, Stat } from "@/components/Card";
import { db } from "@/lib/prisma";
import { updateStatusPage } from "@/lib/functions/updateStatusPage";
import { estimateTaxes } from "@/lib/functions/estimateTaxes";
import { money, shortDate, relativeDate } from "@/lib/format";

export const dynamic = "force-dynamic";

const QUICK_ACTIONS = [
  { label: "New client", prompt: "Create a new client. Ask me for the details." },
  { label: "New project", prompt: "Create a new project. Ask me which client and the brief." },
  { label: "New campaign", prompt: "Start a new campaign. Ask me which client and the goal." },
  { label: "Draft invoice", prompt: "Draft an invoice. Ask me which client and amount." },
  { label: "Generate proposal", prompt: "Generate a proposal for a new client. Ask me the brief first." },
  { label: "Build content calendar", prompt: "Generate a content calendar. Which client and how many weeks?" },
  { label: "Sync memory", prompt: "Refresh the status page and wiki from current DB state." },
  { label: "Review profitability", prompt: "Run a profitability review for the last 90 days." },
  { label: "Review taxes", prompt: "Estimate taxes for the current quarter and tell me what to set aside." },
];

export default async function HomePage() {
  const [status, taxes, activeClients, activeProjects, recentTasks] = await Promise.all([
    updateStatusPage(),
    estimateTaxes(),
    db.client.findMany({ where: { stage: "active" }, orderBy: { name: "asc" } }),
    db.project.findMany({
      where: { status: { in: ["active", "stalled"] } },
      include: { client: { select: { name: true } } },
      orderBy: { dueDate: "asc" },
      take: 8,
    }),
    db.task.findMany({
      where: { status: { in: ["open", "doing"] } },
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
      include: { client: { select: { name: true } } },
      take: 8,
    }),
  ]);

  return (
    <div>
      <PageHeader
        eyebrow="Status"
        title="What's happening in ATLY right now."
        description="The operating layer. Memory, money, momentum — at a glance."
        right={
          <Link
            href="/chat"
            className="rounded-md border border-signal-accent/40 px-4 py-2 text-xs uppercase tracking-[0.25em] text-signal-accent transition hover:bg-signal-accent/10"
          >
            Talk to Axis →
          </Link>
        }
      />

      <section className="mb-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Active clients" value={String(status.counts.activeClients)} />
        <Stat label="Active projects" value={String(status.counts.activeProjects)} />
        <Stat
          label="Outstanding"
          value={money(status.money.outstandingCents)}
          hint={`${status.counts.outstandingInvoices} invoice(s)`}
        />
        <Stat
          label={`${taxes.periodLabel} tax set-aside`}
          value={money(taxes.estimateCents)}
          hint={`${(taxes.setAsidePct * 100).toFixed(0)}% on ${money(taxes.taxableCents)} taxable`}
        />
      </section>

      <section className="mb-10">
        <Card eyebrow="Quick actions" title="Tell Axis what to do.">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {QUICK_ACTIONS.map((q) => (
              <Link
                key={q.label}
                href={`/chat?seed=${encodeURIComponent(q.prompt)}`}
                className="group flex items-center justify-between rounded-md border border-ink-700/50 px-4 py-3 text-sm text-ink-100 transition hover:border-signal-accent/40 hover:bg-ink-800/40"
              >
                <span>{q.label}</span>
                <span className="text-ink-500 transition group-hover:text-signal-accent">→</span>
              </Link>
            ))}
          </div>
        </Card>
      </section>

      <section className="mb-10 grid gap-6 lg:grid-cols-2">
        <Card eyebrow="Active clients" title="Who needs attention.">
          {activeClients.length === 0 ? (
            <p className="text-sm text-ink-400">No active clients yet. Tell Axis to onboard one.</p>
          ) : (
            <ul className="divide-y divide-ink-700/60">
              {activeClients.map((c) => (
                <li key={c.id} className="flex items-start justify-between py-3">
                  <div>
                    <Link href={`/clients`} className="text-sm text-signal hover:underline">
                      {c.name}
                    </Link>
                    {c.nextAction ? (
                      <div className="mt-0.5 text-xs text-ink-300">{c.nextAction}</div>
                    ) : null}
                  </div>
                  {c.handle ? <span className="text-xs text-ink-400">{c.handle}</span> : null}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card eyebrow="Active projects" title="What's in flight.">
          {activeProjects.length === 0 ? (
            <p className="text-sm text-ink-400">No projects in flight.</p>
          ) : (
            <ul className="divide-y divide-ink-700/60">
              {activeProjects.map((p) => (
                <li key={p.id} className="flex items-start justify-between py-3">
                  <div>
                    <div className="text-sm text-signal">
                      {p.client.name} · <span className="text-ink-200">{p.name}</span>
                    </div>
                    {p.nextAction ? (
                      <div className="mt-0.5 text-xs text-ink-300">{p.nextAction}</div>
                    ) : null}
                  </div>
                  <div className="text-right text-xs text-ink-400">
                    <div>{p.status}</div>
                    {p.dueDate ? <div>{relativeDate(p.dueDate)}</div> : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      <section className="mb-10 grid gap-6 lg:grid-cols-2">
        <Card eyebrow="Next best actions" title="Move these forward.">
          {status.nextActions.length === 0 ? (
            <p className="text-sm text-ink-400">Axis hasn't flagged anything.</p>
          ) : (
            <ul className="space-y-2">
              {status.nextActions.slice(0, 8).map((a, i) => (
                <li key={i} className="text-sm text-ink-100" dangerouslySetInnerHTML={{ __html: a.replace(/\*\*(.+?)\*\*/g, '<span class="text-signal">$1</span>') }} />
              ))}
            </ul>
          )}
        </Card>

        <Card eyebrow="Open tasks" title="On the board.">
          {recentTasks.length === 0 ? (
            <p className="text-sm text-ink-400">Clean.</p>
          ) : (
            <ul className="divide-y divide-ink-700/60">
              {recentTasks.map((t) => (
                <li key={t.id} className="flex items-start justify-between py-3">
                  <div>
                    <div className="text-sm text-ink-100">{t.title}</div>
                    {t.client ? (
                      <div className="mt-0.5 text-xs text-ink-400">{t.client.name}</div>
                    ) : null}
                    {t.waitingOn ? (
                      <div className="mt-0.5 text-xs text-flag-warn">waiting on {t.waitingOn}</div>
                    ) : null}
                  </div>
                  <span
                    className={`rounded border px-2 py-0.5 text-[10px] uppercase tracking-widest ${
                      t.priority === "now"
                        ? "border-flag-danger/40 text-flag-danger"
                        : t.priority === "high"
                          ? "border-signal-accent/40 text-signal-accent"
                          : "border-ink-600 text-ink-300"
                    }`}
                  >
                    {t.priority}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      <footer className="mt-12 text-[10px] uppercase tracking-[0.4em] text-ink-500">
        Last synced: {shortDate(new Date(status.updatedAt))} · Axis · phase 1
      </footer>
    </div>
  );
}
