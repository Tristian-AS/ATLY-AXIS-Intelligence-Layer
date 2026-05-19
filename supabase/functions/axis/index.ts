// Supabase Edge Function — Deno runtime.
// Proxies requests from the Lovable frontend to the Axis backend, holding the
// AXIS_API_TOKEN as a Supabase secret so it never lands in the browser bundle.
//
// Deploy:
//   supabase functions deploy axis
//
// Secrets to set:
//   supabase secrets set AXIS_URL=https://axis.atlystudios.ai
//   supabase secrets set AXIS_API_TOKEN=<paste the same token from Vercel>
//   supabase secrets set AXIS_ALLOWED_ORIGINS=https://atlystudios.ai,https://lovable.app
//
// Path mapping:
//   POST /functions/v1/axis/api/axis/chat   → POST https://axis.atlystudios.ai/api/axis/chat
//   GET  /functions/v1/axis/api/axis/status → GET  https://axis.atlystudios.ai/api/axis/status
//   …and so on for every Axis route.
//
// Streaming: SSE responses (the chat endpoint) pass through unmodified because
// we pipe upstream.body straight back as a ReadableStream.

// deno-lint-ignore-file no-explicit-any
declare const Deno: any;

const AXIS_URL = Deno.env.get("AXIS_URL");
const AXIS_API_TOKEN = Deno.env.get("AXIS_API_TOKEN");
const ALLOWED_ORIGINS = (Deno.env.get("AXIS_ALLOWED_ORIGINS") ?? "*")
  .split(",")
  .map((s: string) => s.trim())
  .filter(Boolean);

function buildCors(origin: string | null) {
  const h = new Headers();
  if (!origin) return h;
  const ok = ALLOWED_ORIGINS.includes("*") || ALLOWED_ORIGINS.includes(origin);
  if (!ok) return h;
  h.set("Access-Control-Allow-Origin", origin);
  h.set("Vary", "Origin");
  h.set("Access-Control-Allow-Methods", "GET, POST, PATCH, PUT, DELETE, OPTIONS");
  h.set("Access-Control-Allow-Headers", "authorization, content-type, apikey, x-axis-actor");
  h.set("Access-Control-Allow-Credentials", "true");
  return h;
}

function json(status: number, body: unknown, cors: Headers) {
  const headers = new Headers(cors);
  headers.set("Content-Type", "application/json");
  return new Response(JSON.stringify(body), { status, headers });
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  const cors = buildCors(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  if (!AXIS_URL || !AXIS_API_TOKEN) {
    return json(500, { error: "Axis not configured (set AXIS_URL and AXIS_API_TOKEN secrets)" }, cors);
  }

  // Supabase routes /functions/v1/<fn-name>/<rest> to the function with
  // request.url's pathname starting at /<fn-name>/<rest>. Strip the function
  // segment to get the Axis path the caller wants.
  const url = new URL(req.url);
  const segments = url.pathname.split("/").filter(Boolean);
  // segments[0] === "axis" (this function's name)
  if (segments.length < 2) {
    return json(
      400,
      {
        error:
          "Specify an Axis path, e.g. /functions/v1/axis/api/axis/status or /functions/v1/axis/api/axis/chat",
      },
      cors
    );
  }
  const axisPath = "/" + segments.slice(1).join("/");
  const target = new URL(axisPath + url.search, AXIS_URL);

  const headers = new Headers();
  headers.set("Authorization", `Bearer ${AXIS_API_TOKEN}`);
  headers.set("X-Axis-Actor", "bff:atlystudios");
  const ct = req.headers.get("content-type");
  if (ct) headers.set("Content-Type", ct);
  const accept = req.headers.get("accept");
  if (accept) headers.set("Accept", accept);

  // Forward the user's Supabase JWT for downstream identity (Axis ignores it
  // today; future-proof for per-user actor labels).
  const userJwt = req.headers.get("authorization");
  if (userJwt && /^Bearer\s+ey/i.test(userJwt)) {
    headers.set("X-Lovable-User-Jwt", userJwt.replace(/^Bearer\s+/i, ""));
  }

  const init: RequestInit = {
    method: req.method,
    headers,
  };
  if (!["GET", "HEAD"].includes(req.method)) {
    init.body = req.body;
    // Deno fetch requires duplex when streaming a request body.
    (init as Record<string, unknown>).duplex = "half";
  }

  let upstream: Response;
  try {
    upstream = await fetch(target.toString(), init);
  } catch (err) {
    return json(502, { error: `axis upstream unreachable: ${(err as Error).message}` }, cors);
  }

  const respHeaders = new Headers();
  // Carry through content type + cache + SSE-relevant headers from upstream.
  for (const [k, v] of upstream.headers.entries()) {
    const key = k.toLowerCase();
    if (
      key === "content-type" ||
      key === "cache-control" ||
      key === "x-accel-buffering" ||
      key === "content-encoding"
    ) {
      respHeaders.set(k, v);
    }
  }
  cors.forEach((v, k) => respHeaders.set(k, v));

  return new Response(upstream.body, {
    status: upstream.status,
    headers: respHeaders,
  });
});
