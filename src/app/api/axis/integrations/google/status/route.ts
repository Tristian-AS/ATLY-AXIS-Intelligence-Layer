import { NextResponse } from "next/server";
import { protect } from "@/lib/auth";
import { listConnectedAccounts } from "@/lib/integrations/google-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = protect(async () => {
  const accounts = await listConnectedAccounts();
  return NextResponse.json({
    accounts: accounts.map((a) => ({
      userEmail: a.userEmail,
      scopes: a.scopes.split(/\s+/).filter(Boolean),
      connectedAt: a.createdAt,
      lastRefreshedAt: a.updatedAt,
      accessTokenExpiresAt: a.expiresAt,
    })),
  });
});
