/**
 * useAxis — minimal client-side hook for talking to Axis via the Supabase
 * Edge Function. Drop into a Lovable project (React/Vite + Supabase) and you
 * have typed access to every Axis endpoint.
 *
 * Setup:
 *   1. Deploy the Edge Function under `supabase/functions/axis/`.
 *   2. Add VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY to your env.
 *   3. Optional: paste types from @atly/axis-client/types for type safety.
 */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  // eslint-disable-next-line no-console
  console.warn("[useAxis] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY not set.");
}

const BASE = `${SUPABASE_URL}/functions/v1/axis`;

interface FetchOpts {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
  accessToken?: string; // user's JWT from supabase.auth.getSession() if available
}

async function call<T = unknown>(path: string, opts: FetchOpts = {}): Promise<T> {
  const headers = new Headers();
  headers.set("apikey", SUPABASE_ANON_KEY);
  headers.set("Authorization", `Bearer ${opts.accessToken ?? SUPABASE_ANON_KEY}`);
  if (opts.body !== undefined) headers.set("Content-Type", "application/json");

  const res = await fetch(`${BASE}${path}`, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Axis ${opts.method ?? "GET"} ${path} → ${res.status}: ${text}`);
  }
  return (await res.json()) as T;
}

export const axis = {
  status: () => call("/api/axis/status"),
  health: () => call("/api/health"),

  clients: {
    list: () => call("/api/axis/clients"),
    create: (input: { name: string; industry?: string; stage?: string; brandNotes?: string }) =>
      call("/api/axis/clients", { method: "POST", body: input }),
    get: (id: string) => call(`/api/axis/clients/${id}`),
  },

  projects: {
    list: (clientId?: string) =>
      call(`/api/axis/projects${clientId ? `?clientId=${encodeURIComponent(clientId)}` : ""}`),
    create: (input: { name: string; clientName?: string; brief?: string; budgetDollars?: number }) =>
      call("/api/axis/projects", { method: "POST", body: input }),
  },

  campaigns: {
    list: () => call("/api/axis/campaigns"),
    generatePlan: (input: { clientName: string; brief: string; persist?: boolean }) =>
      call("/api/axis/campaigns", { method: "POST", body: { action: "generate", ...input } }),
  },

  invoices: {
    list: () => call("/api/axis/invoices"),
    create: (input: { clientName?: string; amountDollars: number; dueDate?: string; notes?: string }) =>
      call("/api/axis/invoices", { method: "POST", body: input }),
  },

  expenses: {
    list: () => call("/api/axis/expenses"),
    log: (input: { vendor: string; category: string; amountDollars: number; notes?: string }) =>
      call("/api/axis/expenses", { method: "POST", body: input }),
  },

  tasks: {
    list: (status?: string) =>
      call(`/api/axis/tasks${status ? `?status=${encodeURIComponent(status)}` : ""}`),
    create: (input: { title: string; priority?: string; waitingOn?: string; dueDate?: string }) =>
      call("/api/axis/tasks", { method: "POST", body: input }),
  },

  memory: {
    readWiki: (path: string) =>
      call(`/api/axis/memory?path=${encodeURIComponent(path)}`),
    write: (input: { title: string; body: string; scope?: string; clientName?: string }) =>
      call("/api/axis/memory", { method: "POST", body: input }),
  },

  cinematicEngine: {
    clientDashboard: (clientId: string) =>
      call(`/api/cinematic-engine/client-dashboard?clientId=${encodeURIComponent(clientId)}`),
    contentSystem: (clientId: string) =>
      call(`/api/cinematic-engine/content-system?clientId=${encodeURIComponent(clientId)}`),
    campaigns: (clientId?: string) =>
      call(
        `/api/cinematic-engine/campaigns${clientId ? `?clientId=${encodeURIComponent(clientId)}` : ""}`
      ),
  },

  /**
   * Stream chat replies as SSE. Yields events as they arrive.
   * Usage:
   *   for await (const ev of axis.chatStream("what's happening?")) {
   *     if (ev.event === "delta") setText(prev => prev + ev.data.chunk);
   *     if (ev.event === "done")  console.log("final:", ev.data.reply);
   *   }
   */
  async *chatStream(
    message: string,
    opts: { threadId?: string; accessToken?: string; signal?: AbortSignal } = {}
  ): AsyncGenerator<
    | { event: "delta"; data: { chunk: string } }
    | { event: "tool"; data: { name: string; input: unknown; output: unknown; error?: string } }
    | { event: "done"; data: { reply: string; toolActivity: unknown[]; threadId: string } }
    | { event: "error"; data: { message: string } }
  > {
    const headers = new Headers();
    headers.set("apikey", SUPABASE_ANON_KEY);
    headers.set("Authorization", `Bearer ${opts.accessToken ?? SUPABASE_ANON_KEY}`);
    headers.set("Content-Type", "application/json");
    headers.set("Accept", "text/event-stream");

    const res = await fetch(`${BASE}/api/axis/chat`, {
      method: "POST",
      headers,
      body: JSON.stringify({ message, threadId: opts.threadId ?? "main" }),
      signal: opts.signal,
    });
    if (!res.body) throw new Error("No streaming body from Axis");
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Axis chat stream → ${res.status}: ${text}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buf.indexOf("\n\n")) !== -1) {
        const raw = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        let event = "message";
        const dataLines: string[] = [];
        for (const line of raw.split("\n")) {
          if (line.startsWith("event:")) event = line.slice(6).trim();
          else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
        }
        if (!dataLines.length) continue;
        try {
          const data = JSON.parse(dataLines.join("\n"));
          yield { event, data } as never;
        } catch {
          /* skip malformed */
        }
      }
    }
  },
};
