import { NextRequest, NextResponse } from "next/server";
import { protect } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { sendEmail } from "@/lib/integrations/resend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/axis/setup/test-email
 * Body: { to: string }
 *
 * Sends a simple "Axis is alive" email via Resend and returns the FULL
 * response or error. The /setup/email walkthrough uses this to surface
 * exact Resend error codes inline so the operator can map them to fixes
 * without leaving the page.
 */
export const POST = protect(async (req: NextRequest, { actor }) => {
  const body = (await req.json().catch(() => ({}))) as { to?: string };
  const to = (body.to ?? "").trim();
  if (!to) {
    return NextResponse.json(
      { ok: false, error: "Recipient email required." },
      { status: 400 }
    );
  }

  try {
    const result = await sendEmail({
      to,
      subject: "Axis is alive",
      text:
        "If you're reading this, the Resend → Axis → Vercel pipeline works end to end. " +
        "Sent from the /setup/email walkthrough.",
      html: `<!doctype html><body style="font-family:ui-sans-serif,system-ui,Helvetica,Arial;padding:32px;background:#07080A;color:#E2E6EC;">
  <div style="max-width:480px;margin:0 auto;text-align:left;">
    <div style="font-family:Georgia,serif;font-size:24px;letter-spacing:0.22em;color:#E8E2D4;">ATLY</div>
    <div style="font-size:10px;letter-spacing:0.4em;text-transform:uppercase;color:#A89F8B;margin-top:4px;">axis</div>
    <hr style="border:none;border-top:1px solid #1A1F26;margin:24px 0;" />
    <h1 style="font-family:Georgia,serif;font-weight:400;font-size:20px;color:#E8E2D4;margin:0 0 12px;">Axis is alive.</h1>
    <p style="font-size:14px;line-height:1.7;color:#B8BFC9;margin:0;">
      Resend → Axis → Vercel pipeline works end to end. Sent from /setup/email.
    </p>
  </div>
</body>`,
    });
    await audit({
      actor,
      action: "api:POST /api/axis/setup/test-email",
      target: to,
      payload: { messageId: result.messageId },
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = (err as Error).message;
    await audit({
      actor,
      action: "api:POST /api/axis/setup/test-email",
      target: to,
      status: "error",
      message,
    });
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
});
