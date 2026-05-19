import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/Card";
import { db } from "@/lib/prisma";
import { money, shortDate, relativeDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const projects = await db.project.findMany({
    include: { client: { select: { name: true } } },
    orderBy: [{ status: "asc" }, { dueDate: "asc" }],
  });

  return (
    <div>
      <PageHeader
        eyebrow="Projects"
        title="What ATLY is making."
        description="Deliverables, budget, timeline, files, risks."
        right={
          <Link
            href={`/chat?seed=${encodeURIComponent("Create a new project. Ask which client and the brief.")}`}
            className="rounded-md border border-signal-accent/40 px-4 py-2 text-xs uppercase tracking-[0.25em] text-signal-accent transition hover:bg-signal-accent/10"
          >
            New project →
          </Link>
        }
      />

      {projects.length === 0 ? (
        <Card>
          <p className="text-sm text-ink-300">No projects yet.</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {projects.map((p) => {
            const deliverables: string[] = p.deliverables ? JSON.parse(p.deliverables) : [];
            return (
              <Card key={p.id} className="!p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.35em] text-signal-accent">
                      {p.client.name}
                    </div>
                    <div className="font-display text-xl text-signal">{p.name}</div>
                  </div>
                  <div className="text-right text-xs text-ink-300">
                    <div className="uppercase tracking-widest">{p.status}</div>
                    {p.dueDate ? (
                      <div className="mt-1 text-ink-100">
                        {shortDate(p.dueDate)} · {relativeDate(p.dueDate)}
                      </div>
                    ) : null}
                    {p.budgetCents ? (
                      <div className="mt-1 text-signal">{money(p.budgetCents)}</div>
                    ) : null}
                  </div>
                </div>

                {p.brief ? (
                  <p className="mt-3 text-sm leading-relaxed text-ink-200">{p.brief}</p>
                ) : null}

                {deliverables.length > 0 ? (
                  <div className="mt-4">
                    <div className="text-[10px] uppercase tracking-[0.3em] text-ink-400">
                      Deliverables
                    </div>
                    <ul className="mt-2 flex flex-wrap gap-2">
                      {deliverables.map((d, i) => (
                        <li
                          key={i}
                          className="rounded border border-ink-700/60 px-2 py-1 text-xs text-ink-200"
                        >
                          {d}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {(p.nextAction || p.risks) && (
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    {p.nextAction ? (
                      <div className="text-xs">
                        <span className="text-signal-accent">Next.</span>{" "}
                        <span className="text-ink-200">{p.nextAction}</span>
                      </div>
                    ) : null}
                    {p.risks ? (
                      <div className="text-xs">
                        <span className="text-flag-warn">Risk.</span>{" "}
                        <span className="text-ink-200">{p.risks}</span>
                      </div>
                    ) : null}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
