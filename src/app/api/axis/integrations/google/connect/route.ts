import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { buildAuthUrl } from "@/lib/integrations/google-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
];

/**
 * Initiates the Google OAuth flow. Same-origin only — this is meant to be
 * hit from a browser by Tristian himself, not server-to-server.
 */
export async function GET(req: NextRequest) {
  // Light same-origin gate — protect() requires Bearer for cross-origin calls
  // but this endpoint sets a state cookie so we can't use it through protect.
  const origin = req.headers.get("origin");
  const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "").toLowerCase();
  let sameOrigin = false;
  if (origin) {
    try {
      sameOrigin = new URL(origin).host.toLowerCase() === host;
    } catch {
      sameOrigin = false;
    }
  } else {
    // Direct browser navigation has no Origin header. Treat as same-origin
    // only if the request came from a browser hit of our own host.
    sameOrigin = true;
  }
  if (!sameOrigin) {
    return NextResponse.json({ error: "open from the Axis UI" }, { status: 401 });
  }

  const scopesParam = req.nextUrl.searchParams.get("scopes");
  const scopes = scopesParam ? scopesParam.split(",").map((s) => s.trim()).filter(Boolean) : GMAIL_SCOPES;
  const loginHint = req.nextUrl.searchParams.get("loginHint") ?? undefined;

  const state = randomBytes(24).toString("hex");
  const url = buildAuthUrl({ scopes, state, loginHint });

  const res = NextResponse.redirect(url);
  res.cookies.set("axis_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
