import { db } from "@/lib/prisma";
import { money, shortDate } from "@/lib/format";

const RESEND_API = "https://api.resend.com";

interface ResendSendResponse {
  id: string;
}

async function resendPost<T>(path: string, body: unknown): Promise<T> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    throw new Error("RESEND_API_KEY not configured in Vercel env.");
  }
  const res = await fetch(`${RESEND_API}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Resend ${path} → ${res.status}: ${text}`);
  }
  return (await res.json()) as T;
}

export interface SendEmailInput {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string;
  from?: string;
}

function defaultFrom(): string {
  return (
    process.env.AXIS_EMAIL_FROM ??
    "ATLY Studios <axis@atlystudios.com>"
  );
}

export async function sendEmail(input: SendEmailInput) {
  const from = input.from ?? defaultFrom();
  const payload: Record<string, unknown> = {
    from,
    to: Array.isArray(input.to) ? input.to : [input.to],
    subject: input.subject,
  };
  if (input.html) payload.html = input.html;
  if (input.text) payload.text = input.text;
  if (input.cc) payload.cc = Array.isArray(input.cc) ? input.cc : [input.cc];
  if (input.bcc) payload.bcc = Array.isArray(input.bcc) ? input.bcc : [input.bcc];
  if (input.replyTo) payload.reply_to = input.replyTo;
  if (!input.html && !input.text) {
    throw new Error("sendEmail: either html or text body is required.");
  }
  const result = await resendPost<ResendSendResponse>("/emails", payload);
  return { messageId: result.id, to: payload.to, from, subject: input.subject };
}

export interface SendInvoiceEmailInput {
  invoiceId: string;
  to?: string;
  cc?: string;
  note?: string;
  markSent?: boolean; // default true
}

/**
 * Sends an invoice email via Resend.
 * - Looks up the invoice + client + first contact email if `to` isn't passed.
 * - Renders a clean ATLY-voiced HTML invoice email.
 * - Optionally flips invoice.status to 'sent' (default true).
 */
export async function sendInvoiceEmail(input: SendInvoiceEmailInput) {
  const invoice = await db.invoice.findUnique({
    where: { id: input.invoiceId },
    include: {
      client: { include: { contacts: { orderBy: { createdAt: "asc" }, take: 1 } } },
      project: true,
    },
  });
  if (!invoice) throw new Error(`Invoice not found: ${input.invoiceId}`);

  const to = input.to ?? invoice.client.contacts[0]?.email;
  if (!to) {
    throw new Error(
      `No recipient email. Pass 'to' or add a contact with an email to ${invoice.client.name}.`
    );
  }

  const subject = `Invoice ${invoice.number} from ATLY Studios — ${money(invoice.amountCents)}`;

  const lineItems = invoice.lineItems ? safeJsonParse<Array<{ label: string; amountDollars: number }>>(invoice.lineItems, []) : [];

  const html = renderInvoiceHtml({
    number: invoice.number,
    clientName: invoice.client.name,
    contactName: invoice.client.contacts[0]?.name,
    amount: money(invoice.amountCents),
    dueDate: invoice.dueDate ? shortDate(invoice.dueDate) : null,
    projectName: invoice.project?.name ?? null,
    notes: invoice.notes,
    note: input.note,
    lineItems,
  });

  const text = renderInvoiceText({
    number: invoice.number,
    clientName: invoice.client.name,
    amount: money(invoice.amountCents),
    dueDate: invoice.dueDate ? shortDate(invoice.dueDate) : null,
    notes: invoice.notes,
    note: input.note,
  });

  const result = await sendEmail({
    to,
    cc: input.cc,
    subject,
    html,
    text,
    replyTo: process.env.AXIS_EMAIL_REPLY_TO ?? "tristian@atlystudios.com",
  });

  // Mark invoice sent unless caller opts out
  if (input.markSent !== false && invoice.status === "draft") {
    await db.invoice.update({
      where: { id: invoice.id },
      data: { status: "sent" },
    });
  }

  return {
    ...result,
    invoiceNumber: invoice.number,
    client: invoice.client.name,
    amountCents: invoice.amountCents,
  };
}

function safeJsonParse<T>(s: string, fallback: T): T {
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

function renderInvoiceHtml(args: {
  number: string;
  clientName: string;
  contactName?: string;
  amount: string;
  dueDate: string | null;
  projectName: string | null;
  notes: string | null;
  note?: string;
  lineItems: Array<{ label: string; amountDollars: number }>;
}): string {
  const greeting = args.contactName ? `Hi ${args.contactName.split(" ")[0]},` : `Hello,`;
  const lineItemsHtml = args.lineItems.length
    ? `<table style="width:100%;border-collapse:collapse;margin:24px 0;">
         <thead>
           <tr><th style="text-align:left;padding:8px 0;border-bottom:1px solid #E2E6EC;font-weight:500;color:#5B6470;font-size:11px;text-transform:uppercase;letter-spacing:0.15em;">Item</th>
               <th style="text-align:right;padding:8px 0;border-bottom:1px solid #E2E6EC;font-weight:500;color:#5B6470;font-size:11px;text-transform:uppercase;letter-spacing:0.15em;">Amount</th></tr>
         </thead>
         <tbody>
           ${args.lineItems
             .map(
               (l) => `<tr>
               <td style="padding:8px 0;color:#13171C;">${escape(l.label)}</td>
               <td style="padding:8px 0;text-align:right;color:#13171C;">$${l.amountDollars.toFixed(2)}</td>
             </tr>`
             )
             .join("")}
         </tbody>
       </table>`
    : "";

  return `<!doctype html>
<html><body style="margin:0;padding:32px;background:#F7F5F0;font-family:ui-sans-serif,system-ui,-apple-system,Helvetica,Arial;color:#13171C;">
  <div style="max-width:560px;margin:0 auto;background:#fff;padding:48px 40px;border:1px solid #E2E6EC;">
    <div style="font-family:Georgia,serif;font-size:24px;letter-spacing:0.22em;color:#13171C;">ATLY</div>
    <div style="font-size:10px;letter-spacing:0.4em;text-transform:uppercase;color:#A89F8B;margin-top:4px;">studios</div>

    <hr style="border:none;border-top:1px solid #E2E6EC;margin:32px 0;" />

    <p style="font-size:15px;line-height:1.7;margin:0 0 16px;">${greeting}</p>
    <p style="font-size:15px;line-height:1.7;margin:0 0 16px;">
      Invoice <strong style="color:#13171C;">${escape(args.number)}</strong> is attached below.
      ${args.projectName ? `For <em>${escape(args.projectName)}</em>.` : ""}
    </p>
    ${args.note ? `<p style="font-size:15px;line-height:1.7;margin:0 0 16px;">${escape(args.note)}</p>` : ""}

    ${lineItemsHtml}

    <div style="margin:32px 0;padding:24px;background:#F7F5F0;">
      <div style="display:flex;justify-content:space-between;align-items:baseline;">
        <span style="font-size:11px;letter-spacing:0.25em;text-transform:uppercase;color:#5B6470;">Amount due</span>
        <span style="font-family:Georgia,serif;font-size:28px;color:#13171C;">${escape(args.amount)}</span>
      </div>
      ${args.dueDate ? `<div style="margin-top:12px;font-size:13px;color:#5B6470;">Due ${escape(args.dueDate)}</div>` : ""}
    </div>

    ${args.notes ? `<p style="font-size:13px;line-height:1.7;color:#5B6470;margin:24px 0 0;">${escape(args.notes)}</p>` : ""}

    <hr style="border:none;border-top:1px solid #E2E6EC;margin:40px 0 24px;" />
    <p style="font-size:13px;line-height:1.7;color:#5B6470;margin:0;">
      Reply to this email with questions.
    </p>
    <p style="font-size:13px;line-height:1.7;color:#5B6470;margin:8px 0 0;">
      — ATLY Studios
    </p>
  </div>
</body></html>`;
}

function renderInvoiceText(args: {
  number: string;
  clientName: string;
  amount: string;
  dueDate: string | null;
  notes: string | null;
  note?: string;
}): string {
  return [
    `Invoice ${args.number}`,
    ``,
    args.note ?? "",
    ``,
    `Amount due: ${args.amount}`,
    args.dueDate ? `Due: ${args.dueDate}` : "",
    ``,
    args.notes ?? "",
    ``,
    `Reply to this email with questions.`,
    `— ATLY Studios`,
  ]
    .filter(Boolean)
    .join("\n");
}

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
