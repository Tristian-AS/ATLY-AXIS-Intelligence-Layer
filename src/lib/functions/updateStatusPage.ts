import { db } from "@/lib/prisma";
import { writeWiki } from "@/lib/memory";
import { money, shortDate } from "@/lib/format";

/**
 * Recomputes the wiki/_status.md page from current DB state.
 * The wiki version is human-readable; the JSON return is for the UI.
 */
export async function updateStatusPage() {
  const now = new Date();
  const in30 = new Date(Date.now() + 30 * 86_400_000);
  const last30 = new Date(Date.now() - 30 * 86_400_000);

  const [
    activeClients,
    activeProjects,
    leads,
    waitingTasks,
    upcomingPosts,
    invoices,
    expensesRecent,
    recentTaxes,
  ] = await Promise.all([
    db.client.findMany({ where: { stage: "active" }, orderBy: { name: "asc" } }),
    db.project.findMany({
      where: { status: { in: ["active", "stalled"] } },
      include: { client: true },
      orderBy: { dueDate: "asc" },
    }),
    db.client.findMany({ where: { stage: "lead" }, orderBy: { updatedAt: "desc" } }),
    db.task.findMany({
      where: { status: { in: ["open", "doing", "blocked"] }, waitingOn: { not: null } },
      include: { client: true },
    }),
    db.contentCalendarPost.findMany({
      where: { scheduledFor: { gte: now, lte: in30 }, status: { in: ["draft", "approved", "scheduled"] } },
      include: { client: true },
      orderBy: { scheduledFor: "asc" },
    }),
    db.invoice.findMany({
      where: { status: { in: ["sent", "overdue", "draft"] } },
      include: { client: true },
      orderBy: { dueDate: "asc" },
    }),
    db.expense.findMany({ where: { occurredAt: { gte: last30 } } }),
    db.estimatedTax.findMany({ orderBy: { periodEnd: "desc" }, take: 1 }),
  ]);

  const outstanding = invoices.filter((i) => i.status !== "draft");
  const outstandingTotal = outstanding.reduce((a, i) => a + i.amountCents, 0);
  const expensesTotal = expensesRecent.reduce((a, e) => a + e.amountCents, 0);
  const expensesByCat = expensesRecent.reduce<Record<string, number>>((acc, e) => {
    acc[e.category] = (acc[e.category] ?? 0) + e.amountCents;
    return acc;
  }, {});

  const risks = activeProjects.filter((p) => p.status === "stalled" || p.risks);
  const nextActions = [
    ...activeClients.filter((c) => c.nextAction).map((c) => `**${c.name}** — ${c.nextAction}`),
    ...activeProjects.filter((p) => p.nextAction).map((p) => `**${p.client.name} / ${p.name}** — ${p.nextAction}`),
  ];

  const body = `# _status — What is happening in ATLY right now

_Last updated: ${now.toISOString()}_

## 1. Active Clients
${activeClients.length ? activeClients.map((c) => `- **${c.name}**${c.nextAction ? ` — ${c.nextAction}` : ""}`).join("\n") : "_None._"}

## 2. Active Projects
${
  activeProjects.length
    ? activeProjects
        .map(
          (p) =>
            `- **${p.client.name} / ${p.name}** — ${p.status}${p.dueDate ? `, due ${shortDate(p.dueDate)}` : ""}`
        )
        .join("\n")
    : "_None._"
}

## 3. Hot Leads
${leads.length ? leads.map((l) => `- **${l.name}**${l.nextAction ? ` — ${l.nextAction}` : ""}`).join("\n") : "_None._"}

## 4. Waiting On
${
  waitingTasks.length
    ? waitingTasks
        .map((t) => `- ${t.title} — waiting on **${t.waitingOn}**${t.client ? ` (${t.client.name})` : ""}`)
        .join("\n")
    : "_None._"
}

## 5. Upcoming Shoots
_Synced from shoot-tagged tasks (TODO)._

## 6. Deliverables Due
${
  upcomingPosts.length
    ? upcomingPosts
        .slice(0, 12)
        .map((p) => `- ${shortDate(p.scheduledFor)} — ${p.client.name} / ${p.platform} — ${p.hook ?? p.caption.slice(0, 60)}`)
        .join("\n")
    : "_None scheduled in next 30d._"
}

## 7. Money
- Outstanding invoices (sent/overdue): **${money(outstandingTotal)}**
- Expenses (last 30d): **${money(expensesTotal)}**

## 8. Outstanding Invoices
${
  outstanding.length
    ? outstanding
        .map(
          (i) =>
            `- ${i.number} — ${i.client.name} — ${money(i.amountCents)} — ${i.status}${i.dueDate ? `, due ${shortDate(i.dueDate)}` : ""}`
        )
        .join("\n")
    : "_None._"
}

## 9. Expected Payments
${
  outstanding.length
    ? outstanding
        .filter((i) => i.status === "sent")
        .map((i) => `- ${shortDate(i.dueDate)} — ${i.client.name} — ${money(i.amountCents)}`)
        .join("\n") || "_None expected this cycle._"
    : "_None._"
}

## 10. Expenses (last 30d)
${
  Object.keys(expensesByCat).length
    ? Object.entries(expensesByCat)
        .sort((a, b) => b[1] - a[1])
        .map(([cat, cents]) => `- ${cat}: ${money(cents)}`)
        .join("\n")
    : "_None logged._"
}

## 11. Estimated Taxes
${
  recentTaxes[0]
    ? `- ${recentTaxes[0].periodLabel}: estimate **${money(recentTaxes[0].estimateCents)}** (set aside ${(recentTaxes[0].setAsidePct * 100).toFixed(0)}%)`
    : "_No estimates computed yet._"
}

## 12. Risks
${risks.length ? risks.map((p) => `- **${p.client.name} / ${p.name}** — ${p.risks ?? "stalled"}`).join("\n") : "_None flagged._"}

## 13. Next Best Actions
${nextActions.length ? nextActions.map((a) => `- ${a}`).join("\n") : "_None._"}
`;

  await writeWiki("_status.md", body);

  return {
    updatedAt: now.toISOString(),
    counts: {
      activeClients: activeClients.length,
      activeProjects: activeProjects.length,
      leads: leads.length,
      outstandingInvoices: outstanding.length,
      upcomingPosts: upcomingPosts.length,
    },
    money: {
      outstandingCents: outstandingTotal,
      expensesLast30Cents: expensesTotal,
    },
    nextActions,
  };
}
