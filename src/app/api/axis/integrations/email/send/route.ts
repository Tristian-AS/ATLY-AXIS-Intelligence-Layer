import { NextRequest, NextResponse } from "next/server";
import { protect } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { sendEmail } from "@/lib/integrations/resend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = protect(async (req: NextRequest, { actor }) => {
  const body = (await req.json()) as Parameters<typeof sendEmail>[0];
  const result = await sendEmail(body);
  await audit({
    actor,
    action: "api:POST /api/axis/integrations/email/send",
    target: result.messageId,
    payload: { to: body.to, subject: body.subject },
  });
  return NextResponse.json(result);
});
