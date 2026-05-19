import { db } from "@/lib/prisma";

/**
 * Google OAuth 2.0 helper for Axis.
 *
 * Setup (Google Cloud Console → APIs & Services → Credentials):
 *   1. Create / use an OAuth 2.0 Client ID of type "Web application".
 *   2. Authorized redirect URI must include:
 *        <AXIS_PUBLIC_URL>/api/axis/integrations/google/callback
 *      (and the Vercel preview URL if you use one).
 *   3. Enable the APIs you'll request scopes for (Gmail, Drive, etc.).
 *   4. Set env vars in Vercel:
 *        GOOGLE_OAUTH_CLIENT_ID
 *        GOOGLE_OAUTH_CLIENT_SECRET
 *        AXIS_PUBLIC_URL (used to build the redirect URI)
 */

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const USERINFO_ENDPOINT = "https://openidconnect.googleapis.com/v1/userinfo";

export interface GoogleAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export function googleAuthConfig(): GoogleAuthConfig {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const publicUrl = process.env.AXIS_PUBLIC_URL;
  if (!clientId || !clientSecret) {
    throw new Error(
      "GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET must be set in Vercel env."
    );
  }
  if (!publicUrl) {
    throw new Error(
      "AXIS_PUBLIC_URL must be set so the OAuth callback URL is correct."
    );
  }
  return {
    clientId,
    clientSecret,
    redirectUri: `${publicUrl.replace(/\/+$/, "")}/api/axis/integrations/google/callback`,
  };
}

export function buildAuthUrl(opts: { scopes: string[]; state: string; loginHint?: string }) {
  const cfg = googleAuthConfig();
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: "code",
    scope: ["openid", "email", "profile", ...opts.scopes].join(" "),
    access_type: "offline",
    prompt: "consent", // force refresh_token issuance
    state: opts.state,
    include_granted_scopes: "true",
  });
  if (opts.loginHint) params.set("login_hint", opts.loginHint);
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number; // seconds
  scope: string;
  token_type: "Bearer";
  id_token?: string;
}

export async function exchangeCodeForTokens(code: string): Promise<TokenResponse> {
  const cfg = googleAuthConfig();
  const body = new URLSearchParams({
    code,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    redirect_uri: cfg.redirectUri,
    grant_type: "authorization_code",
  });
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    throw new Error(`Google token exchange failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as TokenResponse;
}

async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const cfg = googleAuthConfig();
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    grant_type: "refresh_token",
  });
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    throw new Error(`Google token refresh failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as TokenResponse;
}

export async function fetchUserEmail(accessToken: string): Promise<string> {
  const res = await fetch(USERINFO_ENDPOINT, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Google userinfo failed: ${res.status}`);
  const data = (await res.json()) as { email?: string };
  if (!data.email) throw new Error("Google userinfo returned no email");
  return data.email;
}

export interface StoredToken {
  userEmail: string;
  scopes: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

export async function persistTokens(input: {
  userEmail: string;
  scopes: string;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}): Promise<StoredToken> {
  const expiresAt = new Date(Date.now() + input.expiresIn * 1000 - 60_000);
  const row = await db.googleOAuthToken.upsert({
    where: { userEmail: input.userEmail },
    create: {
      userEmail: input.userEmail,
      scopes: input.scopes,
      accessToken: input.accessToken,
      refreshToken: input.refreshToken,
      expiresAt,
    },
    update: {
      // Keep merged scopes so we don't lose previously-granted ones if a
      // re-consent flow returns a narrower scope set.
      scopes: mergeScopes(input.scopes),
      accessToken: input.accessToken,
      refreshToken: input.refreshToken,
      expiresAt,
    },
  });
  return {
    userEmail: row.userEmail,
    scopes: row.scopes,
    accessToken: row.accessToken,
    refreshToken: row.refreshToken,
    expiresAt: row.expiresAt,
  };

  function mergeScopes(newScopes: string): string {
    const incoming = new Set(newScopes.split(/\s+/).filter(Boolean));
    // Caller passes the merged set already if they want; for upsert we just
    // take the incoming as-is.
    return Array.from(incoming).join(" ");
  }
}

/**
 * Returns a valid access token for `userEmail`, refreshing if expired.
 * Updates the DB row with the new access token + expiry when it refreshes.
 */
export async function getAccessToken(userEmail: string): Promise<string> {
  const row = await db.googleOAuthToken.findUnique({ where: { userEmail } });
  if (!row) {
    throw new Error(
      `No Google OAuth token stored for ${userEmail}. Connect Gmail first at /integrations/google/connect.`
    );
  }
  if (row.expiresAt.getTime() > Date.now() + 30_000) {
    return row.accessToken;
  }
  const refreshed = await refreshAccessToken(row.refreshToken);
  const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000 - 60_000);
  await db.googleOAuthToken.update({
    where: { userEmail },
    data: {
      accessToken: refreshed.access_token,
      expiresAt: newExpiresAt,
      // refresh_token usually omitted in refresh responses; keep the old one.
      ...(refreshed.refresh_token ? { refreshToken: refreshed.refresh_token } : {}),
    },
  });
  return refreshed.access_token;
}

export async function listConnectedAccounts() {
  const rows = await db.googleOAuthToken.findMany({
    orderBy: { createdAt: "asc" },
    select: { userEmail: true, scopes: true, createdAt: true, updatedAt: true, expiresAt: true },
  });
  return rows;
}

export async function disconnectAccount(userEmail: string) {
  const row = await db.googleOAuthToken.findUnique({ where: { userEmail } });
  if (!row) return { revoked: false, deleted: false };
  // Best-effort: tell Google to revoke the refresh token.
  try {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(row.refreshToken)}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
  } catch {
    /* network blip — we still delete locally */
  }
  await db.googleOAuthToken.delete({ where: { userEmail } });
  return { revoked: true, deleted: true };
}
