// Tool definitions for the Axis MCP server.
// Mirrors AxisClient. Each tool returns JSON that Claude Code can consume.

import type { AxisClient } from "@atly/axis-client";

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  run: (axis: AxisClient, args: any) => Promise<unknown>;
}

export const TOOLS: ToolDef[] = [
  // ---------- read / status ----------
  {
    name: "axis_status",
    description:
      "Read the current ATLY Axis status (active clients, projects, money, tax estimate, next best actions). Use this first when Tristian asks 'what's happening' or 'what should I focus on'.",
    inputSchema: { type: "object", properties: {} },
    run: (axis) => axis.status.get(),
  },
  {
    name: "axis_health",
    description: "Check that the Axis backend is reachable and configured.",
    inputSchema: { type: "object", properties: {} },
    run: (axis) => axis.health(),
  },

  // ---------- clients ----------
  {
    name: "axis_clients_list",
    description: "List all ATLY clients with stage, next action, and counts.",
    inputSchema: { type: "object", properties: {} },
    run: (axis) => axis.clients.list(),
  },
  {
    name: "axis_clients_create",
    description: "Create a new client in Axis. Writes the DB row AND a wiki page.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        handle: { type: "string" },
        website: { type: "string" },
        industry: { type: "string" },
        stage: { type: "string", enum: ["lead", "active", "paused", "churned"] },
        brandNotes: { type: "string" },
        nextAction: { type: "string" },
        retainerDollars: { type: "number" },
      },
      required: ["name"],
    },
    run: (axis, args) => axis.clients.create(args),
  },
  {
    name: "axis_clients_get",
    description: "Get one client with their full context (projects, campaigns, invoices, notes, open tasks).",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
    run: (axis, args) => axis.clients.get(args.id),
  },

  // ---------- projects ----------
  {
    name: "axis_projects_list",
    description: "List projects, optionally filtered by clientId or status.",
    inputSchema: {
      type: "object",
      properties: {
        clientId: { type: "string" },
        status: { type: "string", enum: ["active", "paused", "done", "stalled"] },
      },
    },
    run: (axis, args) => axis.projects.list(args),
  },
  {
    name: "axis_projects_create",
    description: "Create a project for a client. Pass clientName to look up by name, or clientId.",
    inputSchema: {
      type: "object",
      properties: {
        clientName: { type: "string" },
        clientId: { type: "string" },
        name: { type: "string" },
        brief: { type: "string" },
        deliverables: { type: "array", items: { type: "string" } },
        budgetDollars: { type: "number" },
        startDate: { type: "string" },
        dueDate: { type: "string" },
        nextAction: { type: "string" },
      },
      required: ["name"],
    },
    run: (axis, args) => axis.projects.create(args),
  },

  // ---------- campaigns ----------
  {
    name: "axis_campaigns_list",
    description: "List all campaigns across all clients.",
    inputSchema: { type: "object", properties: {} },
    run: (axis) => axis.campaigns.list(),
  },
  {
    name: "axis_campaigns_generate_plan",
    description:
      "Have ATLY's Creative Director agent produce a cinematic campaign plan (concept, hero direction, hooks, goals). Set persist=true to save it as a campaign row + wiki page.",
    inputSchema: {
      type: "object",
      properties: {
        clientName: { type: "string" },
        brief: { type: "string" },
        goal: { type: "string" },
        persist: { type: "boolean" },
      },
      required: ["clientName", "brief"],
    },
    run: (axis, args) => axis.campaigns.generatePlan(args),
  },

  // ---------- content calendar ----------
  {
    name: "axis_content_calendar_list",
    description: "List scheduled / posted content. Optionally filter by client.",
    inputSchema: {
      type: "object",
      properties: { clientId: { type: "string" } },
    },
    run: (axis, args) => axis.contentCalendar.list(args.clientId),
  },
  {
    name: "axis_content_calendar_generate",
    description:
      "Generate a multi-week content calendar across platforms via ATLY's Content Systems agent.",
    inputSchema: {
      type: "object",
      properties: {
        clientName: { type: "string" },
        campaignId: { type: "string" },
        weeks: { type: "number" },
        platforms: { type: "array", items: { type: "string" } },
        persist: { type: "boolean" },
      },
      required: ["clientName"],
    },
    run: (axis, args) => axis.contentCalendar.generate(args),
  },

  // ---------- finance ----------
  {
    name: "axis_invoices_list",
    description: "List invoices (all statuses). Includes amount cents, due date, paid status.",
    inputSchema: { type: "object", properties: {} },
    run: (axis) => axis.invoices.list(),
  },
  {
    name: "axis_invoices_create",
    description: "Draft a new invoice. Auto-numbers (ATLY-YYYY-NNNN). Does not send.",
    inputSchema: {
      type: "object",
      properties: {
        clientName: { type: "string" },
        clientId: { type: "string" },
        amountDollars: { type: "number" },
        dueDate: { type: "string" },
        notes: { type: "string" },
      },
      required: ["amountDollars"],
    },
    run: (axis, args) => axis.invoices.create(args),
  },
  {
    name: "axis_expenses_list",
    description: "List recent expenses with category + amount.",
    inputSchema: { type: "object", properties: {} },
    run: (axis) => axis.expenses.list(),
  },
  {
    name: "axis_expenses_log",
    description: "Log a business expense.",
    inputSchema: {
      type: "object",
      properties: {
        vendor: { type: "string" },
        category: {
          type: "string",
          enum: ["software", "travel", "meals", "advertising", "equipment", "contract_labor", "subscriptions", "insurance", "other"],
        },
        amountDollars: { type: "number" },
        occurredAt: { type: "string" },
        notes: { type: "string" },
        taxDeductible: { type: "boolean" },
      },
      required: ["vendor", "category", "amountDollars"],
    },
    run: (axis, args) => axis.expenses.log(args),
  },
  {
    name: "axis_taxes_estimate",
    description: "Get the current quarter's estimated tax set-aside.",
    inputSchema: { type: "object", properties: {} },
    run: (axis) => axis.taxes.estimate(),
  },

  // ---------- tasks ----------
  {
    name: "axis_tasks_list",
    description: "List open tasks. Pass status to filter.",
    inputSchema: {
      type: "object",
      properties: { status: { type: "string", enum: ["open", "doing", "done", "blocked"] } },
    },
    run: (axis, args) => axis.tasks.list(args.status),
  },
  {
    name: "axis_tasks_create",
    description: "Add a task to Axis.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        detail: { type: "string" },
        priority: { type: "string", enum: ["low", "normal", "high", "now"] },
        waitingOn: { type: "string" },
        dueDate: { type: "string" },
      },
      required: ["title"],
    },
    run: (axis, args) => axis.tasks.create(args),
  },
  {
    name: "axis_tasks_update",
    description: "Update a task's status (e.g. mark done).",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        status: { type: "string", enum: ["open", "doing", "done", "blocked"] },
      },
      required: ["id"],
    },
    run: (axis, args) => axis.tasks.update(args),
  },

  // ---------- memory / wiki ----------
  {
    name: "axis_memory_read",
    description:
      "Read a markdown file from Axis's wiki (e.g. '_status.md', 'clients/rhome.md', 'brand/index.md'). Use this before answering anything about ATLY's history, brand, or lessons.",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"],
    },
    run: (axis, args) => axis.memory.readWiki(args.path),
  },
  {
    name: "axis_memory_list",
    description: "List entries under a wiki directory.",
    inputSchema: {
      type: "object",
      properties: { dir: { type: "string" } },
    },
    run: (axis, args) => axis.memory.listWiki(args.dir ?? ""),
  },
  {
    name: "axis_memory_write",
    description:
      "Write a durable note to Axis's wiki + memory_notes table. Use for lessons learned, durable facts, journal entries.",
    inputSchema: {
      type: "object",
      properties: {
        scope: {
          type: "string",
          enum: ["client", "project", "campaign", "finance", "lesson", "brand", "general"],
        },
        clientName: { type: "string" },
        title: { type: "string" },
        body: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
        wikiPath: { type: "string" },
        mode: { type: "string", enum: ["append", "replace"] },
      },
      required: ["title", "body"],
    },
    run: (axis, args) => axis.memory.write(args),
  },

  // ---------- chat (let Claude Code escalate to Axis itself) ----------
  {
    name: "axis_chat",
    description:
      "Send a message to the Axis chat (the studio's operating brain). Axis runs its own tool-use loop server-side. Use this when Tristian wants ATLY's voice and judgment, not just data.",
    inputSchema: {
      type: "object",
      properties: {
        message: { type: "string" },
        threadId: { type: "string", description: "Default: 'main'" },
      },
      required: ["message"],
    },
    run: (axis, args) => axis.chat.send(args.message, args.threadId ?? "main"),
  },

  // ---------- Cinematic Growth Engine ----------
  {
    name: "axis_cinematic_engine_dashboard",
    description: "Read the client-facing dashboard payload for a given client.",
    inputSchema: {
      type: "object",
      properties: { clientId: { type: "string" } },
      required: ["clientId"],
    },
    run: (axis, args) => axis.cinematicEngine.clientDashboard(args.clientId),
  },
];
