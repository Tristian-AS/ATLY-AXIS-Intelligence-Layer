import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForTokens, fetchUserEmail, persistTokens } from "@/lib/integrations/google-oauth";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const error = req.nextUrl.searchParams.get("error");
  if (error) {
    return new NextResponse(
      `<!doctype html><body style="font-family:sans-serif;padding:40px;background:#07080A;color:#E2E6EC;"><h1>Google OAuth denied</h1><p>${error}</p></body>`,
      { status: 400, headers: { "Content-Type": "text/html" } }
    );
  }
  if (!code) {
    return NextResponse.json({ error: "missing code" }, { status: 400 });
  }
  const cookieState = req.cookies.get("axis_oauth_state")?.value;
  if (!cookieState || cookieState !== state) {
    return NextResponse.json({ error: "state mismatch — restart connect flow" }, { status: 400 });
  }

  let tokens;
  try {
    tokens = await exchangeCodeForTokens(code);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }

  let userEmail: string;
  try {
    userEmail = await fetchUserEmail(tokens.access_token);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }

  if (!tokens.refresh_token) {
    // Google only issues refresh_token on first consent (or with prompt=consent).
    // Our buildAuthUrl sets prompt=consent so this shouldn't happen — but if it
    // does, we can't persist a re-usable connection.
    return NextResponse.json(
      {
        error:
          "Google did not return a refresh_token. Revoke Axis from your Google account permissions (myaccount.google.com/permissions) and try again.",
      },
      { status: 500 }
    );
  }

  await persistTokens({
    userEmail,
    scopes: tokens.scope,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresIn: tokens.expires_in,
  });

  await audit({
    actor: "tristian",
    action: "google:oauth.connected",
    target: userEmail,
    payload: { scopes: tokens.scope },
  });

  const html = `<!doctype html>
<html><body style="margin:0;padding:48px;font-family:ui-sans-serif,system-ui,-apple-system,Helvetica,Arial;background:#07080A;color:#E2E6EC;">
  <div style="max-width:520px;margin:0 auto;text-align:center;">
    <div style="font-family:Georgia,serif;font-size:24px;letter-spacing:0.22em;color:#E8E2D4;">ATLY</div>
    <div style="font-size:10px;letter-spacing:0.4em;text-transform:uppercase;color:#A89F8B;margin-top:4px;">axis</div>
    <hr style="border:none;border-top:1px solid #1A1F26;margin:32px 0;" />
    <h1 style="font-family:Georgia,serif;font-weight:400;font-size:24px;letter-spacing:-0.01em;color:#E8E2D4;">Connected.</h1>
    <p style="font-size:14px;line-height:1.7;color:#B8BFC9;">
      <strong style="color:#C9A86A;">${userEmail}</strong> is wired into Axis.
    </p>
    <p style="font-size:13px;color:#5B6470;margin-top:24px;">You can close this tab.</p>
  </div>
</body></html>`;

  return new NextResponse(html, { status: 200, headers: { "Content-Type": "text/html" } });
}
