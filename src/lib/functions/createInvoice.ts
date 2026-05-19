import { db } from "@/lib/prisma";
import { dollarsToCents } from "@/lib/format";

export interface CreateInvoiceInput {
  clientId?: string;
  clientName?: string;
  projectId?: string;
  amountDollars: number;
  dueDate?: string;
  notes?: string;
  lineItems?: { label: string; amountDollars: number }[];
}

function nextInvoiceNumber(existing: string[]): string {
  const year = new Date().getFullYear();
  const prefix = `ATLY-${year}-`;
  const max = existing
    .filter((n) => n.startsWith(prefix))
    .map((n) => parseInt(n.slice(prefix.length), 10) || 0)
    .reduce((a, b) => Math.max(a, b), 0);
  return `${prefix}${String(max + 1).padStart(4, "0")}`;
}

export async function createInvoice(input: CreateInvoiceInput) {
  let clientId = input.clientId;
  if (!clientId && input.clientName) {
    const found = await db.client.findFirst({ where: { name: input.clientName } });
    if (found) clientId = found.id;
  }
  if (!clientId) throw new Error("createInvoice: clientId or known clientName required.");

  const all = await db.invoice.findMany({ select: { number: true } });
  const number = nextInvoiceNumber(all.map((i) => i.number));

  const amountCents = dollarsToCents(input.amountDollars) ?? 0;
  if (amountCents <= 0) throw new Error("createInvoice: amount must be > 0.");

  const invoice = await db.invoice.create({
    data: {
      number,
      clientId,
      projectId: input.projectId,
      amountCents,
      dueDate: input.dueDate ? new Date(input.dueDate) : null,
      notes: input.notes,
      lineItems: input.lineItems ? JSON.stringify(input.lineItems) : null,
      status: "draft",
    },
    include: { client: true, project: true },
  });

  return { invoice };
}
