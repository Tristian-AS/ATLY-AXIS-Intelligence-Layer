import { NextRequest, NextResponse } from "next/server";
import { protect } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { stripeRefund } from "@/lib/integrations/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = protect(async (req: NextRequest, { actor }) => {
  const body = (await req.json()) as { chargeId: string; amountCents?: number; reason?: string };
  if (!body.chargeId) {
    return NextResponse.json({ error: "chargeId required" }, { status: 400 });
  }
  const refund = await stripeRefund(body);
  await audit({
    actor,
    action: "api:POST /api/axis/integrations/stripe/refund",
    target: refund.id,
    payload: body,
  });
  return NextResponse.json({ refund });
});
