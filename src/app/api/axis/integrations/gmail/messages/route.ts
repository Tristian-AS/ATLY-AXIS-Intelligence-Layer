import { NextRequest, NextResponse } from "next/server";
import { protect } from "@/lib/auth";
import { gmailListMessages, gmailGetMessage } from "@/lib/integrations/gmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = protect(async (req: NextRequest) => {
  const sp = req.nextUrl.searchParams;
  const id = sp.get("id");
  if (id) {
    const message = await gmailGetMessage({ id, userEmail: sp.get("userEmail") ?? undefined });
    return NextResponse.json({ message });
  }
  const messages = await gmailListMessages({
    userEmail: sp.get("userEmail") ?? undefined,
    q: sp.get("q") ?? undefined,
    maxResults: sp.get("maxResults") ? parseInt(sp.get("maxResults") as string, 10) : undefined,
  });
  return NextResponse.json({ messages });
});
