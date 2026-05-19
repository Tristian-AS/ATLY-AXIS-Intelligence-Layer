import { db } from "@/lib/prisma";

export interface EstimateTaxesInput {
  periodStart?: string;
  periodEnd?: string;
  setAsidePct?: number; // default 0.30
  persist?: boolean;
}

function currentQuarter(d = new Date()): { start: Date; end: Date; label: string } {
  const q = Math.floor(d.getMonth() / 3);
  const year = d.getFullYear();
  const start = new Date(year, q * 3, 1);
  const end = new Date(year, q * 3 + 3, 0, 23, 59, 59);
  return { start, end, label: `Q${q + 1} ${year}` };
}

export async function estimateTaxes(input: EstimateTaxesInput = {}) {
  const { start, end, label } = currentQuarter();
  const periodStart = input.periodStart ? new Date(input.periodStart) : start;
  const periodEnd = input.periodEnd ? new Date(input.periodEnd) : end;
  const setAsidePct = input.setAsidePct ?? 0.3;

  const [payments, expenses] = await Promise.all([
    db.payment.findMany({
      where: { receivedAt: { gte: periodStart, lte: periodEnd } },
    }),
    db.expense.findMany({
      where: { occurredAt: { gte: periodStart, lte: periodEnd }, taxDeductible: true },
    }),
  ]);

  const grossRevenueCents = payments.reduce((a, p) => a + p.amountCents, 0);
  const deductibleCents = expenses.reduce((a, e) => a + e.amountCents, 0);
  const taxableCents = Math.max(0, grossRevenueCents - deductibleCents);
  const estimateCents = Math.round(taxableCents * setAsidePct);

  const byCategory = expenses.reduce<Record<string, number>>((acc, e) => {
    acc[e.category] = (acc[e.category] ?? 0) + e.amountCents;
    return acc;
  }, {});

  let saved: { id: string } | null = null;
  if (input.persist) {
    saved = await db.estimatedTax.create({
      data: {
        periodLabel: label,
        periodStart,
        periodEnd,
        grossRevenueCents,
        deductibleCents,
        taxableCents,
        estimateCents,
        setAsidePct,
      },
      select: { id: true },
    });
  }

  return {
    periodLabel: label,
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    setAsidePct,
    grossRevenueCents,
    deductibleCents,
    taxableCents,
    estimateCents,
    byCategory,
    savedId: saved?.id ?? null,
  };
}
