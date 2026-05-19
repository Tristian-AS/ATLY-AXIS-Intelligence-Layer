# @atly/axis-client

Typed TypeScript client for the [ATLY Axis](../) backend.

Use this from a **server** (Next.js route handler, Node service, edge function).
Never instantiate it in the browser — the token is server-only.

## Install

From GitHub (subpath of the Axis repo):

```bash
npm install github:Tristian-AS/ATLY-AXIS-Intelligence-Layer#main \
  --workspaces=false
# then import via the package's "main": "./client/dist/index.js"
```

Or — simpler for now — copy `client/src/` into your app's `src/lib/axis/` and
add `"@anthropic-ai/sdk"`-style imports against your own paths.

## Usage

```ts
import { AxisClient } from "@atly/axis-client";

const axis = new AxisClient({
  baseUrl: process.env.AXIS_URL!,        // e.g. https://axis.atlystudios.ai
  token: process.env.AXIS_API_TOKEN!,     // server-only
  actor: "bff:atlystudios",
});

// Status dashboard
const { status, taxes } = await axis.status.get();

// Talk to Axis
const reply = await axis.chat.send("What should I focus on today?");

// Stream a reply
for await (const ev of axis.chat.stream("Generate a campaign for Rhøme")) {
  if (ev.event === "delta") process.stdout.write(ev.data.chunk);
  if (ev.event === "done") console.log("\n— final:", ev.data.reply);
}

// CRUD
const { client } = await axis.clients.create({ name: "Loftwood", industry: "architecture" });
const { project } = await axis.projects.create({ clientName: "Loftwood", name: "Hero film" });
const { invoice } = await axis.invoices.create({ clientName: "Loftwood", amountDollars: 8500 });

// Cinematic Growth Engine — for client-facing dashboards on atlystudios.ai
const dash = await axis.cinematicEngine.clientDashboard(client.id);
```

## Streaming into a browser (BFF pattern)

Your atlystudios.ai server proxies the SSE stream to the browser:

```ts
// app/api/axis/chat/route.ts in atlystudios.ai
import { AxisClient } from "@atly/axis-client";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const { message } = await req.json();
  const axis = new AxisClient({ baseUrl: process.env.AXIS_URL!, token: process.env.AXIS_API_TOKEN! });

  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      for await (const ev of axis.chat.stream(message)) {
        controller.enqueue(encoder.encode(`event: ${ev.event}\ndata: ${JSON.stringify(ev.data)}\n\n`));
      }
      controller.close();
    },
  });

  return new Response(body, { headers: { "Content-Type": "text/event-stream" } });
}
```

The browser then opens an `EventSource("/api/axis/chat")` (or fetch+reader for POSTed
SSE) and treats the deltas as a live transcript. The Axis token never leaves the server.
