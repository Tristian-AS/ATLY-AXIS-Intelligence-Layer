import { NextRequest, NextResponse } from "next/server";
import { protect } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { disconnectAccount } from "@/lib/integrations/google-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = protect(async (req: NextRequest, { actor }) => {
  const { userEmail } = (await req.json()) as { userEmail: string };
  if (!userEmail) {
    return NextResponse.json({ error: "userEmail required" }, { status: 400 });
  }
  const result = await disconnectAccount(userEmail);
  await audit({
    actor,
    action: "google:oauth.disconnected",
    target: userEmail,
    payload: result,
  });
  return NextResponse.json(result);
});
