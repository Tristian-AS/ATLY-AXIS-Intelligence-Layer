import { NextRequest, NextResponse } from "next/server";
import { protect } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { sendInvoiceEmail } from "@/lib/integrations/resend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = protect<{ id: string }>(async (req, { params, actor }) => {
  const { id } = params;
  const body = (await req.json().catch(() => ({}))) as {
    to?: string;
    cc?: string;
    note?: string;
    markSent?: boolean;
  };
  const result = await sendInvoiceEmail({
    invoiceId: id,
    to: body.to,
    cc: body.cc,
    note: body.note,
    markSent: body.markSent,
  });
  await audit({
    actor,
    action: "api:POST /api/axis/invoices/[id]/send",
    target: id,
    payload: { to: body.to ?? "from-contact", note: body.note },
  });
  return NextResponse.json(result);
});
