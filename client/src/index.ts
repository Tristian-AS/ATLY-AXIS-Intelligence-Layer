import type {
  AxisClient as ClientRow,
  AxisProject,
  AxisCampaign,
  AxisInvoice,
  AxisExpense,
  AxisTask,
  AxisContentPost,
  ChatReply,
  HealthResponse,
  SseEvent,
  StatusSummary,
  TaxEstimate,
} from "./types";
import { readSse } from "./streaming";

export * from "./types";

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface AxisClientOptions {
  /** Base URL of the Axis backend, e.g. https://axis.atlystudios.ai */
  baseUrl: string;
  /** Server-only token. Never put this in a browser bundle. */
  token: string;
  /** Optional custom fetch (e.g. for Node < 18, or for retry wrappers). */
  fetch?: FetchLike;
  /** Identifies the caller in audit logs. Default: "bff:atlystudios". */
  actor?: string;
}

export class AxisClient {
  private base: string;
  private token: string;
  private fetch: FetchLike;
  private actor: string;

  constructor(opts: AxisClientOptions) {
    this.base = opts.baseUrl.replace(/\/+$/, "");
    this.token = opts.token;
    this.fetch = opts.fetch ?? globalThis.fetch.bind(globalThis);
    this.actor = opts.actor ?? "bff:atlystudios";
  }

  // ----- low-level -----
  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    init: RequestInit = {}
  ): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${this.token}`);
    headers.set("X-Axis-Actor", this.actor);
    if (body !== undefined && !(body instanceof FormData)) {
      headers.set("Content-Type", "application/json");
    }
    const res = await this.fetch(`${this.base}${path}`, {
      ...init,
      method,
      headers,
      body:
        body === undefined
          ? undefined
          : body instanceof FormData
            ? body
            : JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Axis ${method} ${path} → ${res.status}: ${text}`);
    }
    return (await res.json()) as T;
  }

  // ----- system -----
  health = (): Promise<HealthResponse> => this.request("GET", "/api/health");

  // ----- chat -----
  chat = {
    /** Non-streaming. Returns the full reply once tools resolve. */
    send: (message: string, threadId = "main"): Promise<ChatReply> =>
      this.request("POST", "/api/axis/chat?stream=0", { message, threadId }),

    /**
     * Streaming. Yields SSE events as the model thinks. Final event is `done`.
     * Caller is responsible for forwarding deltas to the browser if needed.
     */
    stream: async function* (
      this: AxisClient,
      message: string,
      threadId = "main"
    ): AsyncGenerator<SseEvent> {
      const headers = new Headers();
      headers.set("Authorization", `Bearer ${this.token}`);
      headers.set("X-Axis-Actor", this.actor);
      headers.set("Content-Type", "application/json");
      headers.set("Accept", "text/event-stream");
      const res = await this.fetch(`${this.base}/api/axis/chat`, {
        method: "POST",
        headers,
        body: JSON.stringify({ message, threadId }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Axis chat stream → ${res.status}: ${text}`);
      }
      yield* readSse(res);
    },

    history: (threadId = "main") =>
      this.request<{ threadId: string; messages: unknown[] }>(
        "GET",
        `/api/axis/chat?threadId=${encodeURIComponent(threadId)}`
      ),
  };

  // ----- clients -----
  clients = {
    list: () => this.request<{ clients: ClientRow[] }>("GET", "/api/axis/clients"),
    create: (input: Partial<ClientRow> & { name: string }) =>
      this.request<{ client: ClientRow; wikiPath: string }>("POST", "/api/axis/clients", input),
    get: (id: string) =>
      this.request<{ client: ClientRow & Record<string, unknown> }>("GET", `/api/axis/clients/${id}`),
    update: (id: string, patch: Partial<ClientRow>) =>
      this.request<{ client: ClientRow }>("PATCH", `/api/axis/clients/${id}`, patch),
    remove: (id: string) =>
      this.request<{ ok: true }>("DELETE", `/api/axis/clients/${id}`),
  };

  // ----- projects -----
  projects = {
    list: (filters: { clientId?: string; status?: string } = {}) => {
      const qs = new URLSearchParams();
      if (filters.clientId) qs.set("clientId", filters.clientId);
      if (filters.status) qs.set("status", filters.status);
      const suffix = qs.toString() ? `?${qs}` : "";
      return this.request<{ projects: AxisProject[] }>("GET", `/api/axis/projects${suffix}`);
    },
    create: (input: Partial<AxisProject> & { name: string }) =>
      this.request<{ project: AxisProject; wikiPath: string }>("POST", "/api/axis/projects", input),
  };

  // ----- campaigns -----
  campaigns = {
    list: () => this.request<{ campaigns: AxisCampaign[] }>("GET", "/api/axis/campaigns"),
    create: (input: Partial<AxisCampaign> & { name: string }) =>
      this.request<{ campaign: AxisCampaign; wikiPath: string }>(
        "POST",
        "/api/axis/campaigns",
        input
      ),
    generatePlan: (input: { clientName: string; brief: string; goal?: string; persist?: boolean }) =>
      this.request("POST", "/api/axis/campaigns", { action: "generate", ...input }),
  };

  // ----- content calendar -----
  contentCalendar = {
    list: (clientId?: string) => {
      const suffix = clientId ? `?clientId=${encodeURIComponent(clientId)}` : "";
      return this.request<{ posts: AxisContentPost[] }>(
        "GET",
        `/api/axis/content-calendar${suffix}`
      );
    },
    generate: (input: {
      clientName: string;
      campaignId?: string;
      weeks?: number;
      platforms?: string[];
      persist?: boolean;
    }) =>
      this.request("POST", "/api/axis/content-calendar", { action: "generate", ...input }),
  };

  // ----- invoices -----
  invoices = {
    list: () => this.request<{ invoices: AxisInvoice[] }>("GET", "/api/axis/invoices"),
    create: (input: { clientName?: string; clientId?: string; amountDollars: number; dueDate?: string; notes?: string }) =>
      this.request<{ invoice: AxisInvoice }>("POST", "/api/axis/invoices", input),
  };

  // ----- expenses -----
  expenses = {
    list: () => this.request<{ expenses: AxisExpense[] }>("GET", "/api/axis/expenses"),
    log: (input: {
      vendor: string;
      category: string;
      amountDollars: number;
      occurredAt?: string;
      notes?: string;
      taxDeductible?: boolean;
    }) => this.request<{ expense: AxisExpense }>("POST", "/api/axis/expenses", input),
  };

  // ----- tasks -----
  tasks = {
    list: (status?: string) => {
      const suffix = status ? `?status=${encodeURIComponent(status)}` : "";
      return this.request<{ tasks: AxisTask[] }>("GET", `/api/axis/tasks${suffix}`);
    },
    create: (input: Partial<AxisTask> & { title: string }) =>
      this.request<{ task: AxisTask }>("POST", "/api/axis/tasks", input),
    update: (input: { id: string; status?: string }) =>
      this.request<{ task: AxisTask }>("PATCH", "/api/axis/tasks", input),
  };

  // ----- memory -----
  memory = {
    listWiki: (dir = "") =>
      this.request<{ dir: string; entries: string[]; notes: unknown[] }>(
        "GET",
        `/api/axis/memory${dir ? `?dir=${encodeURIComponent(dir)}` : ""}`
      ),
    readWiki: (path: string) =>
      this.request<{ path: string; content: string }>(
        "GET",
        `/api/axis/memory?path=${encodeURIComponent(path)}`
      ),
    write: (input: {
      scope?: string;
      title: string;
      body: string;
      clientName?: string;
      tags?: string[];
      wikiPath?: string;
      mode?: "append" | "replace";
    }) => this.request<{ note: unknown; wikiPath: string }>("POST", "/api/axis/memory", input),
  };

  // ----- status -----
  status = {
    get: () => this.request<StatusSummary>("GET", "/api/axis/status"),
    sync: () => this.request<{ status: StatusSummary["status"] }>("POST", "/api/axis/status"),
  };

  // ----- finance -----
  taxes = {
    estimate: () =>
      this.request<{ taxes: TaxEstimate }>("GET", "/api/axis/status").then((r) => r.taxes),
  };

  // ----- files -----
  files = {
    list: (clientId?: string) => {
      const suffix = clientId ? `?clientId=${encodeURIComponent(clientId)}` : "";
      return this.request<{ files: unknown[] }>("GET", `/api/axis/files${suffix}`);
    },
    upload: (
      file: Blob,
      meta: { kind: string; label?: string; clientId?: string; projectId?: string; filename?: string }
    ) => {
      const form = new FormData();
      const filename =
        meta.filename ?? ("name" in file && typeof (file as File).name === "string" ? (file as File).name : "upload");
      form.append("file", file, filename);
      form.append("kind", meta.kind);
      if (meta.label) form.append("label", meta.label);
      if (meta.clientId) form.append("clientId", meta.clientId);
      if (meta.projectId) form.append("projectId", meta.projectId);
      return this.request<{ file: unknown; path: string }>("POST", "/api/axis/files", form);
    },
  };

  // ----- Cinematic Growth Engine -----
  cinematicEngine = {
    campaigns: (clientId?: string) => {
      const suffix = clientId ? `?clientId=${encodeURIComponent(clientId)}` : "";
      return this.request<{ campaigns: unknown[] }>(
        "GET",
        `/api/cinematic-engine/campaigns${suffix}`
      );
    },
    contentSystem: (clientId: string) =>
      this.request<{ posts: AxisContentPost[] }>(
        "GET",
        `/api/cinematic-engine/content-system?clientId=${encodeURIComponent(clientId)}`
      ),
    clientDashboard: (clientId: string) =>
      this.request<{
        client: ClientRow;
        projects: AxisProject[];
        campaigns: AxisCampaign[];
        upcomingPosts: AxisContentPost[];
        analytics: unknown[];
      }>(
        "GET",
        `/api/cinematic-engine/client-dashboard?clientId=${encodeURIComponent(clientId)}`
      ),
  };
}
