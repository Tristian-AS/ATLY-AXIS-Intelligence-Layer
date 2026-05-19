import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { Card, Stat } from "@/components/Card";
import { db } from "@/lib/prisma";
import { estimateTaxes } from "@/lib/functions/estimateTaxes";
import { money, shortDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function FinancePage() {
  const [invoices, expenses, subscriptions, taxes, payments] = await Promise.all([
    db.invoice.findMany({
      include: { client: { select: { name: true } } },
      orderBy: { issueDate: "desc" },
      take: 30,
    }),
    db.expense.findMany({ orderBy: { occurredAt: "desc" }, take: 30 }),
    db.subscription.findMany({ where: { active: true }, orderBy: { amountCents: "desc" } }),
    estimateTaxes(),
    db.payment.findMany({ orderBy: { receivedAt: "desc" }, take: 10 }),
  ]);

  const outstanding = invoices
    .filter((i) => i.status === "sent" || i.status === "overdue")
    .reduce((a, i) => a + i.amountCents, 0);
  const paid = invoices
    .filter((i) => i.status === "paid")
    .reduce((a, i) => a + i.amountCents, 0);
  const expensesTotal = expenses.reduce((a, e) => a + e.amountCents, 0);
  const subTotal = subscriptions.reduce((a, s) => a + s.amountCents, 0);

  return (
    <div>
      <PageHeader
        eyebrow="Finance"
        title="The CFO layer."
        description="Invoices, expenses, subscriptions, taxes, profitability."
        right={
          <Link
            href={`/chat?seed=${encodeURIComponent("Estimate taxes for this quarter and tell me what to set aside.")}`}
            className="rounded-md border border-signal-accent/40 px-4 py-2 text-xs uppercase tracking-[0.25em] text-signal-accent transition hover:bg-signal-accent/10"
          >
            Review taxes →
          </Link>
        }
      />

      <section className="mb-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Outstanding" value={money(outstanding)} hint="invoices sent + overdue" />
        <Stat label="Paid (last 30 invoices)" value={money(paid)} />
        <Stat label="Recurring subs / mo" value={money(subTotal)} hint={`${subscriptions.length} active`} />
        <Stat
          label={`${taxes.periodLabel} set-aside`}
          value={money(taxes.estimateCents)}
          hint={`${(taxes.setAsidePct * 100).toFixed(0)}% on ${money(taxes.taxableCents)}`}
        />
      </section>

      <section className="mb-10 grid gap-6 lg:grid-cols-2">
        <Card eyebrow="Invoices" title="Latest billings">
          {invoices.length === 0 ? (
            <p className="text-sm text-ink-400">No invoices yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-widest text-ink-400">
                  <th className="pb-2">#</th>
                  <th className="pb-2">Client</th>
                  <th className="pb-2">Amount</th>
                  <th className="pb-2">Status</th>
                  <th className="pb-2">Due</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-700/60">
                {invoices.map((i) => (
                  <tr key={i.id}>
                    <td className="py-2 text-ink-300">{i.number}</td>
                    <td className="py-2 text-signal">{i.client.name}</td>
                    <td className="py-2 text-ink-100">{money(i.amountCents)}</td>
                    <td className="py-2">
                      <span
                        className={`rounded border px-2 py-0.5 text-[10px] uppercase tracking-widest ${
                          i.status === "paid"
                            ? "border-flag-ok/40 text-flag-ok"
                            : i.status === "overdue"
                              ? "border-flag-danger/40 text-flag-danger"
                              : "border-ink-600 text-ink-300"
                        }`}
                      >
                        {i.status}
                      </span>
                    </td>
                    <td className="py-2 text-ink-300">{i.dueDate ? shortDate(i.dueDate) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card eyebrow="Expenses" title={`Last 30 · ${money(expensesTotal)}`}>
          {expenses.length === 0 ? (
            <p className="text-sm text-ink-400">No expenses logged.</p>
          ) : (
            <ul className="divide-y divide-ink-700/60">
              {expenses.map((e) => (
                <li key={e.id} className="flex items-center justify-between py-2">
                  <div>
                    <div className="text-sm text-ink-100">{e.vendor}</div>
                    <div className="text-[10px] uppercase tracking-widest text-ink-400">
                      {e.category} · {shortDate(e.occurredAt)}
                    </div>
                  </div>
                  <div className="text-sm text-signal">{money(e.amountCents)}</div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      <section className="mb-10 grid gap-6 lg:grid-cols-2">
        <Card eyebrow="Subscriptions" title="Recurring burn">
          {subscriptions.length === 0 ? (
            <p className="text-sm text-ink-400">None tracked.</p>
          ) : (
            <ul className="divide-y divide-ink-700/60">
              {subscriptions.map((s) => (
                <li key={s.id} className="flex items-center justify-between py-2">
                  <div>
                    <div className="text-sm text-ink-100">{s.name}</div>
                    <div className="text-[10px] uppercase tracking-widest text-ink-400">
                      {s.cycle} · {s.category}
                    </div>
                  </div>
                  <div className="text-sm text-signal">{money(s.amountCents)}</div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card eyebrow="Tax estimate" title={taxes.periodLabel}>
          <div className="space-y-2 text-sm">
            <Row label="Gross revenue" value={money(taxes.grossRevenueCents)} />
            <Row label="Deductible" value={money(taxes.deductibleCents)} />
            <Row label="Taxable" value={money(taxes.taxableCents)} />
            <div className="my-2 atly-divider" />
            <Row
              label={`Set aside (${(taxes.setAsidePct * 100).toFixed(0)}%)`}
              value={money(taxes.estimateCents)}
              accent
            />
            {Object.keys(taxes.byCategory).length > 0 ? (
              <div className="mt-4">
                <div className="mb-2 text-[10px] uppercase tracking-widest text-ink-400">
                  Deductions by category
                </div>
                <ul className="space-y-1">
                  {Object.entries(taxes.byCategory)
                    .sort((a, b) => b[1] - a[1])
                    .map(([cat, cents]) => (
                      <li key={cat} className="flex justify-between text-xs text-ink-200">
                        <span>{cat}</span>
                        <span>{money(cents)}</span>
                      </li>
                    ))}
                </ul>
              </div>
            ) : null}
          </div>
        </Card>
      </section>

      <Card eyebrow="Payments" title="Recently received">
        {payments.length === 0 ? (
          <p className="text-sm text-ink-400">No payments yet.</p>
        ) : (
          <ul className="divide-y divide-ink-700/60">
            {payments.map((p) => (
              <li key={p.id} className="flex items-center justify-between py-2 text-sm">
                <span className="text-ink-300">{shortDate(p.receivedAt)}</span>
                <span className="text-ink-100">{p.method ?? "—"}</span>
                <span className="text-signal">{money(p.amountCents)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-ink-300">{label}</span>
      <span className={accent ? "text-signal-accent" : "text-signal"}>{value}</span>
    </div>
  );
}
