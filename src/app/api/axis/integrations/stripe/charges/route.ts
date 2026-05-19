import { NextRequest, NextResponse } from "next/server";
import { protect } from "@/lib/auth";
import { stripeRecentCharges, stripeBalance } from "@/lib/integrations/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = protect(async (req: NextRequest) => {
  const limit = parseInt(req.nextUrl.searchParams.get("limit") ?? "20", 10);
  const [charges, balance] = await Promise.all([
    stripeRecentCharges({ limit }),
    stripeBalance().catch((e) => ({ error: (e as Error).message })),
  ]);
  return NextResponse.json({ charges, balance });
});
