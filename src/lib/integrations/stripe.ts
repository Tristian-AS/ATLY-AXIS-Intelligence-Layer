import Stripe from "stripe";
import { db } from "@/lib/prisma";

let _stripe: Stripe | null = null;

export function stripeClient(): Stripe {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "STRIPE_SECRET_KEY not configured. Set it in Vercel env vars (restricted key recommended)."
    );
  }
  _stripe = new Stripe(key, { apiVersion: "2024-11-20.acacia" as Stripe.LatestApiVersion });
  return _stripe;
}

export interface StripeSyncResult {
  scannedCharges: number;
  paymentsCreated: number;
  invoicesMarkedPaid: number;
  errors: Array<{ chargeId: string; message: string }>;
}

/**
 * Pulls recent succeeded charges from Stripe and mirrors them into Axis as
 * Payment rows. If a charge's description or metadata references an Axis
 * invoice number, the matching Invoice is marked paid.
 *
 * Idempotent: uses each Stripe charge id as the dedup key in Payment.notes.
 */
export async function syncStripeCharges(opts: { sinceDays?: number; limit?: number } = {}): Promise<StripeSyncResult> {
  const stripe = stripeClient();
  const since = Math.floor(Date.now() / 1000) - (opts.sinceDays ?? 90) * 86_400;
  const limit = Math.min(opts.limit ?? 100, 100);

  const result: StripeSyncResult = {
    scannedCharges: 0,
    paymentsCreated: 0,
    invoicesMarkedPaid: 0,
    errors: [],
  };

  const charges = await stripe.charges.list({
    created: { gte: since },
    limit,
    expand: ["data.customer"],
  });

  for (const charge of charges.data) {
    result.scannedCharges++;
    if (charge.status !== "succeeded" || charge.refunded) continue;

    try {
      // Dedup: skip if we already have a Payment with this charge id in notes.
      const existing = await db.payment.findFirst({
        where: { notes: { contains: charge.id } },
      });
      if (existing) continue;

      // Match to an Axis invoice via:
      //   1. charge.metadata.axis_invoice_number
      //   2. description matching "ATLY-YYYY-NNNN"
      const invoiceNumberHint =
        (charge.metadata?.axis_invoice_number as string | undefined) ??
        charge.description?.match(/ATLY-\d{4}-\d{4}/i)?.[0];

      const invoice = invoiceNumberHint
        ? await db.invoice.findUnique({ where: { number: invoiceNumberHint } })
        : null;

      // Try to match a client via Stripe customer email.
      let clientId: string | undefined = invoice?.clientId;
      if (!clientId && charge.customer && typeof charge.customer !== "string") {
        const cust = charge.customer as Stripe.Customer;
        const email = cust.email;
        if (email) {
          const contact = await db.contact.findFirst({ where: { email } });
          if (contact) clientId = contact.clientId;
        }
      }

      await db.payment.create({
        data: {
          amountCents: charge.amount,
          invoiceId: invoice?.id,
          clientId,
          method: "card",
          receivedAt: new Date(charge.created * 1000),
          notes: `stripe:${charge.id}${charge.description ? ` · ${charge.description}` : ""}`,
        },
      });
      result.paymentsCreated++;

      if (invoice && invoice.status !== "paid" && charge.amount >= invoice.amountCents) {
        await db.invoice.update({
          where: { id: invoice.id },
          data: { status: "paid", paidAt: new Date(charge.created * 1000) },
        });
        result.invoicesMarkedPaid++;
      }
    } catch (err) {
      result.errors.push({ chargeId: charge.id, message: (err as Error).message });
    }
  }

  return result;
}

export async function stripeBalance(): Promise<{ available: number; pending: number; currency: string }> {
  const stripe = stripeClient();
  const balance = await stripe.balance.retrieve();
  const available = balance.available.reduce((a, b) => a + b.amount, 0);
  const pending = balance.pending.reduce((a, b) => a + b.amount, 0);
  return {
    available,
    pending,
    currency: (balance.available[0]?.currency ?? "usd").toLowerCase(),
  };
}

export async function stripeRecentCharges(opts: { limit?: number } = {}) {
  const stripe = stripeClient();
  const charges = await stripe.charges.list({
    limit: Math.min(opts.limit ?? 20, 100),
    expand: ["data.customer"],
  });
  return charges.data.map((c) => ({
    id: c.id,
    amount: c.amount,
    currency: c.currency,
    status: c.status,
    description: c.description,
    customerEmail: typeof c.customer === "object" && c.customer ? (c.customer as Stripe.Customer).email : null,
    createdAt: new Date(c.created * 1000).toISOString(),
    refunded: c.refunded,
  }));
}

/**
 * Issues a refund against a Stripe charge. Writable scope.
 */
export async function stripeRefund(opts: { chargeId: string; amountCents?: number; reason?: string }) {
  const stripe = stripeClient();
  const refund = await stripe.refunds.create({
    charge: opts.chargeId,
    ...(opts.amountCents ? { amount: opts.amountCents } : {}),
    ...(opts.reason ? { reason: opts.reason as Stripe.RefundCreateParams.Reason } : {}),
  });
  return {
    id: refund.id,
    chargeId: refund.charge,
    amount: refund.amount,
    status: refund.status,
  };
}
