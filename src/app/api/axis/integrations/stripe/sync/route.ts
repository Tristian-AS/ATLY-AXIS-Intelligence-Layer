import { NextRequest, NextResponse } from "next/server";
import { protect } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { syncStripeCharges } from "@/lib/integrations/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const POST = protect(async (req: NextRequest, { actor }) => {
  const body = await req.json().catch(() => ({}));
  const result = await syncStripeCharges({
    sinceDays: body.sinceDays,
    limit: body.limit,
  });
  await audit({
    actor,
    action: "api:POST /api/axis/integrations/stripe/sync",
    payload: { sinceDays: body.sinceDays, limit: body.limit, summary: { ...result, errors: result.errors.length } },
  });
  return NextResponse.json(result);
});
