import { NextResponse } from "next/server";
import { updateStatusPage } from "@/lib/functions/updateStatusPage";
import { estimateTaxes } from "@/lib/functions/estimateTaxes";

export const dynamic = "force-dynamic";

export async function GET() {
  const [status, taxes] = await Promise.all([updateStatusPage(), estimateTaxes()]);
  return NextResponse.json({ status, taxes });
}

export async function POST() {
  const status = await updateStatusPage();
  return NextResponse.json({ status });
}
