import { NextRequest, NextResponse } from "next/server";

export type AxisActor =
  | "tristian"
  | "bff:atlystudios"
  | "plugin:claude-code"
  | "system";

const PUBLIC_HOSTS = new Set<string>();
(() => {
  const url = process.env.AXIS_PUBLIC_URL;
  if (url) {
    try {
      PUBLIC_HOSTS.add(new URL(url).host);
    } catch {
      /* malformed; ignore */
    }
  }
})();

/**
 * Returns null if the request is authorized; otherwise a 401 response.
 *
 * Rules:
 * - Same-origin requests (Origin/Host matches AXIS_PUBLIC_URL) pass through.
 *   This lets Tristian's own Axis UI work without putting tokens in the browser.
 * - Otherwise: requires `Authorization: Bearer <AXIS_API_TOKEN>` matching env.
 *
 * Identifies the actor for audit logging.
 */
export function checkAuth(req: NextRequest): { actor: AxisActor } | NextResponse {
  const expected = process.env.AXIS_API_TOKEN;

  const host = req.headers.get("host") ?? "";
  const origin = req.headers.get("origin");
  let sameOrigin = false;
  if (origin) {
    try {
      sameOrigin = PUBLIC_HOSTS.has(new URL(origin).host) || new URL(origin).host === host;
    } catch {
      sameOrigin = false;
    }
  } else {
    // No Origin header = non-browser same-host call (e.g. server-side rendering).
    sameOrigin = PUBLIC_HOSTS.has(host) || PUBLIC_HOSTS.size === 0;
  }
  if (sameOrigin) return { actor: "tristian" };

  if (!expected) {
    return NextResponse.json(
      { error: "AXIS_API_TOKEN not configured on the server." },
      { status: 500 }
    );
  }

  const header = req.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match || match[1] !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const actorHeader = (req.headers.get("x-axis-actor") ?? "").toLowerCase();
  const actor: AxisActor =
    actorHeader === "plugin:claude-code"
      ? "plugin:claude-code"
      : actorHeader === "tristian"
        ? "tristian"
        : "bff:atlystudios";

  return { actor };
}

/**
 * Wraps a route handler with auth + audit context.
 *
 * Matches Next 15's RouteContext shape: the second arg of a route handler
 * always carries `params: Promise<...>`. Routes without dynamic segments
 * get an empty params object.
 *
 * Usage:
 *   export const POST = protect(async (req, { actor }) => { ... });
 *   export const GET  = protect<{ id: string }>(async (req, { params }) => { ... });
 */
type Handler<C> = (
  req: NextRequest,
  ctx: { actor: AxisActor; params: C }
) => Promise<Response | NextResponse> | Response | NextResponse;

export function protect<C = Record<string, never>>(handler: Handler<C>) {
  return async (
    req: NextRequest,
    routeCtx: { params: Promise<C> }
  ): Promise<Response | NextResponse> => {
    const result = checkAuth(req);
    if (result instanceof NextResponse) return result;
    const params = (await routeCtx.params) ?? ({} as C);
    return await handler(req, { actor: result.actor, params });
  };
}
