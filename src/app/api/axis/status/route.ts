import { NextResponse } from "next/server";
import { updateStatusPage } from "@/lib/functions/updateStatusPage";
import { estimateTaxes } from "@/lib/functions/estimateTaxes";
import { protect } from "@/lib/auth";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export const GET = protect(async () => {
  const [status, taxes] = await Promise.all([updateStatusPage(), estimateTaxes()]);
  return NextResponse.json({ status, taxes });
});

export const POST = protect(async (_req, { actor }) => {
  const status = await updateStatusPage();
  await audit({ actor, action: "api:POST /api/axis/status" });
  return NextResponse.json({ status });
});
