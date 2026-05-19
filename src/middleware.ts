import { NextRequest, NextResponse } from "next/server";

const ALLOWED_METHODS = "GET,POST,PATCH,PUT,DELETE,OPTIONS";
const ALLOWED_HEADERS = "authorization,content-type,x-axis-actor";

function allowedOrigins(): string[] {
  const raw = process.env.AXIS_ALLOWED_ORIGINS ?? "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function corsHeaders(origin: string | null) {
  const allowed = allowedOrigins();
  const headers = new Headers();
  if (origin && (allowed.includes(origin) || allowed.includes("*"))) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
    headers.set("Access-Control-Allow-Methods", ALLOWED_METHODS);
    headers.set("Access-Control-Allow-Headers", ALLOWED_HEADERS);
    headers.set("Access-Control-Allow-Credentials", "true");
    headers.set("Access-Control-Max-Age", "86400");
  }
  return headers;
}

export function middleware(req: NextRequest) {
  const origin = req.headers.get("origin");

  if (req.method === "OPTIONS") {
    const headers = corsHeaders(origin);
    return new NextResponse(null, { status: 204, headers });
  }

  const res = NextResponse.next();
  const headers = corsHeaders(origin);
  headers.forEach((value, key) => res.headers.set(key, value));
  return res;
}

export const config = {
  matcher: ["/api/:path*"],
};
