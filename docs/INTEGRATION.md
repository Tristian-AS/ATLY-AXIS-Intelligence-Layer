# Wiring ATLYSTUDIOS.AI → Axis (Next.js variant)

> **Note:** atlystudios.ai is actually built on **Lovable** (React/Vite +
> Supabase). For that setup, use [`docs/LOVABLE_SUPABASE.md`](./LOVABLE_SUPABASE.md)
> — it replaces the Next.js BFF below with a Supabase Edge Function. This
> file remains as a reference for any future Next.js consumer of Axis.

The mental model:

```
atlystudios.ai (browser)        ← cockpit. Chat UI, dashboards, uploads.
        ↓ fetch / EventSource
atlystudios.ai server (BFF)     ← holds AXIS_API_TOKEN, proxies to Axis.
        ↓ AxisClient
Axis backend (Vercel)
```

The browser **never** sees the Axis token, the Anthropic key, the wiki, or the
DB. It calls atlystudios.ai's own server routes, which in turn use `AxisClient`
to talk to Axis. Same shape your auth tokens already take.

## 1. Install the client SDK

In the atlystudios.ai repo:

```bash
npm install github:Tristian-AS/ATLY-AXIS-Intelligence-Layer#main
```

> The Axis repo's `package.json` `main` points at `./client/dist/index.js`, so
> `import { AxisClient } from "atly-axis"` works after install. If you want a
> cleaner import, vendor `client/src/` into your atlystudios.ai repo as
> `src/lib/axis/` instead — the file is ~250 lines, zero runtime deps.

## 2. Environment variables in atlystudios.ai

```env
# atlystudios.ai server
AXIS_URL=https://axis.atlystudios.ai
AXIS_API_TOKEN=<paste from Axis Vercel project — must match exactly>
```

These stay server-only. Don't prefix them with `NEXT_PUBLIC_`.

## 3. The BFF route — proxy chat with streaming

`app/api/axis/chat/route.ts` in atlystudios.ai:

```ts
import { AxisClient } from "atly-axis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const axis = new AxisClient({
  baseUrl: process.env.AXIS_URL!,
  token: process.env.AXIS_API_TOKEN!,
  actor: "bff:atlystudios",
});

export async function POST(req: Request) {
  const { message, threadId } = await req.json();

  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const ev of axis.chat.stream(message, threadId)) {
          controller.enqueue(
            encoder.encode(`event: ${ev.event}\ndata: ${JSON.stringify(ev.data)}\n\n`)
          );
        }
      } catch (err) {
        controller.enqueue(
          encoder.encode(
            `event: error\ndata: ${JSON.stringify({ message: (err as Error).message })}\n\n`
          )
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
```

## 4. The React component — consume the stream

`components/AxisChat.tsx` in atlystudios.ai:

```tsx
"use client";
import { useState } from "react";

export function AxisChat() {
  const [text, setText] = useState("");
  const [transcript, setTranscript] = useState<{ role: string; content: string }[]>([]);
  const [live, setLive] = useState("");
  const [busy, setBusy] = useState(false);

  async function send() {
    if (!text.trim()) return;
    const message = text;
    setText("");
    setTranscript((t) => [...t, { role: "user", content: message }]);
    setBusy(true);

    const res = await fetch("/api/axis/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });
    if (!res.body) {
      setBusy(false);
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let assistant = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buf.indexOf("\n\n")) !== -1) {
        const raw = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        let eventName = "message";
        const dataLines: string[] = [];
        for (const line of raw.split("\n")) {
          if (line.startsWith("event:")) eventName = line.slice(6).trim();
          else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
        }
        if (!dataLines.length) continue;
        const data = JSON.parse(dataLines.join("\n"));
        if (eventName === "delta") {
          assistant += data.chunk;
          setLive(assistant);
        }
        if (eventName === "done") {
          setTranscript((t) => [...t, { role: "assistant", content: data.reply }]);
          setLive("");
        }
      }
    }
    setBusy(false);
  }

  return (
    <div>
      {transcript.map((m, i) => (
        <p key={i}><strong>{m.role}:</strong> {m.content}</p>
      ))}
      {live && <p><strong>axis:</strong> {live}<span className="cursor">▍</span></p>}
      <textarea value={text} onChange={(e) => setText(e.target.value)} />
      <button onClick={send} disabled={busy}>Send</button>
    </div>
  );
}
```

## 5. Server-side actions — no chat, just data

Anywhere on the server (server component, route handler, server action) you
can call `AxisClient` directly:

```ts
import { AxisClient } from "atly-axis";

export async function createClientFromForm(formData: FormData) {
  "use server";
  const axis = new AxisClient({
    baseUrl: process.env.AXIS_URL!,
    token: process.env.AXIS_API_TOKEN!,
  });
  const { client } = await axis.clients.create({
    name: String(formData.get("name")),
    industry: String(formData.get("industry") ?? ""),
    stage: "lead",
  });
  return client;
}
```

## 6. File uploads

Browser → atlystudios.ai BFF → Axis. The BFF can stream multipart through:

```ts
// app/api/axis/upload/route.ts
import { AxisClient } from "atly-axis";

export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get("file") as File;
  const axis = new AxisClient({ baseUrl: process.env.AXIS_URL!, token: process.env.AXIS_API_TOKEN! });
  const result = await axis.files.upload(file, {
    kind: String(form.get("kind") ?? "note"),
    clientId: form.get("clientId") as string | undefined,
  });
  return Response.json(result);
}
```

## 7. Client-facing dashboards (Cinematic Growth Engine)

For pages on atlystudios.ai that *clients of ATLY* see:

```ts
const dashboard = await axis.cinematicEngine.clientDashboard(clientId);
// → { client, projects, campaigns, upcomingPosts, analytics }
```

These endpoints return only client-safe shapes — no brand notes, no internal
finances, no audit context.

## Future: Claude Code plugin

A future Claude Code plugin hits the same `/api/*` surface with
`X-Axis-Actor: plugin:claude-code` so audit logs cleanly separate Tristian's
edits, atlystudios.ai-driven changes, and CLI-driven ones. No additional auth
plumbing needed — same bearer token, different actor label.
