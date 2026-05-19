import type Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import type { AxisActor } from "@/lib/auth";
import { listWiki, readWiki } from "@/lib/memory";
import { createClient } from "@/lib/functions/createClient";
import { createProject } from "@/lib/functions/createProject";
import { createInvoice } from "@/lib/functions/createInvoice";
import { createCampaign } from "@/lib/functions/createCampaign";
import { generateCampaignPlan } from "@/lib/functions/generateCampaignPlan";
import { generateContentCalendar } from "@/lib/functions/generateContentCalendar";
import { updateMemory } from "@/lib/functions/updateMemory";
import { updateStatusPage } from "@/lib/functions/updateStatusPage";
import { estimateTaxes } from "@/lib/functions/estimateTaxes";
import { dollarsToCents } from "@/lib/format";

type Tool = Anthropic.Tool;

export const AXIS_TOOLS: Tool[] = [
  {
    name: "createClient",
    description: "Create a new client in the operating system. Writes to the `clients` table and creates a wiki page.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        handle: { type: "string", description: "Social handle, e.g. @rhome" },
        website: { type: "string" },
        industry: { type: "string" },
        stage: { type: "string", enum: ["lead", "active", "paused", "churned"] },
        brandNotes: { type: "string", description: "Brand voice, positioning, do's/don'ts." },
        nextAction: { type: "string" },
        retainerDollars: { type: "number" },
      },
      required: ["name"],
    },
  },
  {
    name: "createProject",
    description: "Create a new project linked to a client.",
    input_schema: {
      type: "object",
      properties: {
        clientName: { type: "string", description: "Existing client name to link to." },
        clientId: { type: "string" },
        name: { type: "string" },
        brief: { type: "string" },
        deliverables: { type: "array", items: { type: "string" } },
        budgetDollars: { type: "number" },
        startDate: { type: "string", description: "ISO date" },
        dueDate: { type: "string", description: "ISO date" },
        status: { type: "string", enum: ["active", "paused", "done", "stalled"] },
        nextAction: { type: "string" },
      },
      required: ["name"],
    },
  },
  {
    name: "createCampaign",
    description: "Create a campaign concept for a client.",
    input_schema: {
      type: "object",
      properties: {
        clientName: { type: "string" },
        clientId: { type: "string" },
        projectId: { type: "string" },
        name: { type: "string" },
        concept: { type: "string" },
        hooks: { type: "array", items: { type: "string" } },
        heroDirection: { type: "string" },
        goals: { type: "string" },
        startDate: { type: "string" },
        endDate: { type: "string" },
      },
      required: ["name"],
    },
  },
  {
    name: "createInvoice",
    description: "Draft an invoice. Number is auto-generated. Does not send.",
    input_schema: {
      type: "object",
      properties: {
        clientName: { type: "string" },
        clientId: { type: "string" },
        projectId: { type: "string" },
        amountDollars: { type: "number" },
        dueDate: { type: "string" },
        notes: { type: "string" },
        lineItems: {
          type: "array",
          items: {
            type: "object",
            properties: { label: { type: "string" }, amountDollars: { type: "number" } },
            required: ["label", "amountDollars"],
          },
        },
      },
      required: ["amountDollars"],
    },
  },
  {
    name: "logExpense",
    description: "Log a business expense / receipt.",
    input_schema: {
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
  },
  {
    name: "logPayment",
    description: "Record a payment received from a client. Optionally mark an invoice paid.",
    input_schema: {
      type: "object",
      properties: {
        clientName: { type: "string" },
        invoiceNumber: { type: "string" },
        amountDollars: { type: "number" },
        method: { type: "string" },
        receivedAt: { type: "string" },
        notes: { type: "string" },
      },
      required: ["amountDollars"],
    },
  },
  {
    name: "createTask",
    description: "Add a task. Use when something needs doing or someone owes Tristian a response.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        detail: { type: "string" },
        clientName: { type: "string" },
        projectName: { type: "string" },
        priority: { type: "string", enum: ["low", "normal", "high", "now"] },
        waitingOn: { type: "string", description: "Person or party blocking this task." },
        dueDate: { type: "string" },
      },
      required: ["title"],
    },
  },
  {
    name: "generateCampaignPlan",
    description: "Have the Creative Director agent produce a cinematic campaign plan. Set persist=true to save as a campaign row.",
    input_schema: {
      type: "object",
      properties: {
        clientName: { type: "string" },
        brief: { type: "string" },
        goal: { type: "string" },
        persist: { type: "boolean" },
      },
      required: ["clientName", "brief"],
    },
  },
  {
    name: "generateContentCalendar",
    description: "Have the Content Systems agent generate a multi-week content calendar.",
    input_schema: {
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
  },
  {
    name: "updateMemory",
    description: "Write a durable note into the wiki and memory_notes table. Use when Tristian tells you something worth remembering.",
    input_schema: {
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
        wikiPath: { type: "string", description: "Optional path override under wiki/." },
        mode: { type: "string", enum: ["append", "replace"] },
      },
      required: ["title", "body"],
    },
  },
  {
    name: "updateStatusPage",
    description: "Recompute wiki/_status.md from current DB state. Returns the live status summary.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "estimateTaxes",
    description: "Compute estimated taxes for a period (defaults to current quarter).",
    input_schema: {
      type: "object",
      properties: {
        periodStart: { type: "string" },
        periodEnd: { type: "string" },
        setAsidePct: { type: "number", description: "0.0–1.0, default 0.30" },
        persist: { type: "boolean" },
      },
    },
  },
  {
    name: "listClients",
    description: "List clients. Optional filter by stage.",
    input_schema: {
      type: "object",
      properties: { stage: { type: "string", enum: ["lead", "active", "paused", "churned"] } },
    },
  },
  {
    name: "listProjects",
    description: "List projects, optionally filtered by client name or status.",
    input_schema: {
      type: "object",
      properties: {
        clientName: { type: "string" },
        status: { type: "string", enum: ["active", "paused", "done", "stalled"] },
      },
    },
  },
  {
    name: "readWiki",
    description: "Read a markdown file under wiki/. Use for context before answering or planning.",
    input_schema: {
      type: "object",
      properties: { path: { type: "string", description: "Relative path under wiki/, e.g. '_status.md'." } },
      required: ["path"],
    },
  },
  {
    name: "listWiki",
    description: "List files/folders under a wiki directory.",
    input_schema: {
      type: "object",
      properties: { path: { type: "string", description: "Relative path under wiki/. Default empty = root." } },
    },
  },

  // --- Update / delete ---
  {
    name: "updateClient",
    description: "Edit fields on an existing client. Use when something needs correcting or the next action changes.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Client id; use listClients if you only know the name." },
        name: { type: "string" },
        handle: { type: "string" },
        website: { type: "string" },
        industry: { type: "string" },
        stage: { type: "string", enum: ["lead", "active", "paused", "churned"] },
        brandNotes: { type: "string" },
        nextAction: { type: "string" },
        retainerDollars: { type: "number" },
      },
      required: ["id"],
    },
  },
  {
    name: "deleteClient",
    description: "Permanently delete a client and everything cascade-linked to it. Confirm with Tristian before calling.",
    input_schema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
  {
    name: "updateProject",
    description: "Edit a project's fields (status, brief, deliverables, dates, risks, next action).",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        status: { type: "string", enum: ["active", "paused", "done", "stalled"] },
        brief: { type: "string" },
        deliverables: { type: "array", items: { type: "string" } },
        budgetDollars: { type: "number" },
        startDate: { type: "string" },
        dueDate: { type: "string" },
        risks: { type: "string" },
        nextAction: { type: "string" },
      },
      required: ["id"],
    },
  },
  {
    name: "deleteProject",
    description: "Delete a project. Confirm with Tristian first.",
    input_schema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
  {
    name: "updateCampaign",
    description: "Edit a campaign (concept, hero direction, hooks, goals, status, dates).",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        concept: { type: "string" },
        heroDirection: { type: "string" },
        hooks: { type: "array", items: { type: "string" } },
        goals: { type: "string" },
        status: { type: "string", enum: ["draft", "live", "wrapped"] },
        startDate: { type: "string" },
        endDate: { type: "string" },
      },
      required: ["id"],
    },
  },
  {
    name: "deleteCampaign",
    description: "Delete a campaign.",
    input_schema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
  {
    name: "updateInvoice",
    description: "Edit an invoice — change status (draft → sent → paid → overdue → void), amount, due date, notes. Setting status to 'paid' stamps paidAt automatically.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string" },
        status: { type: "string", enum: ["draft", "sent", "paid", "overdue", "void"] },
        amountDollars: { type: "number" },
        dueDate: { type: "string" },
        notes: { type: "string" },
      },
      required: ["id"],
    },
  },
  {
    name: "deleteInvoice",
    description: "Delete an invoice. Confirm with Tristian.",
    input_schema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
  {
    name: "updateExpense",
    description: "Edit a logged expense (vendor, category, amount, notes, taxDeductible).",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string" },
        vendor: { type: "string" },
        category: { type: "string" },
        amountDollars: { type: "number" },
        occurredAt: { type: "string" },
        notes: { type: "string" },
        taxDeductible: { type: "boolean" },
      },
      required: ["id"],
    },
  },
  {
    name: "deleteExpense",
    description: "Delete an expense.",
    input_schema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
  {
    name: "updateTask",
    description: "Edit a task. Setting status='done' stamps completedAt automatically. Use this to complete, snooze, reassign, or change priority.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string" },
        title: { type: "string" },
        detail: { type: "string" },
        status: { type: "string", enum: ["open", "doing", "done", "blocked"] },
        priority: { type: "string", enum: ["low", "normal", "high", "now"] },
        waitingOn: { type: "string" },
        dueDate: { type: "string" },
      },
      required: ["id"],
    },
  },
  {
    name: "deleteTask",
    description: "Delete a task.",
    input_schema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
  {
    name: "updateContentPost",
    description: "Edit a content calendar post — change caption, hook, platform, scheduled time, or approval status.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string" },
        platform: { type: "string" },
        caption: { type: "string" },
        hook: { type: "string" },
        status: { type: "string", enum: ["draft", "approved", "scheduled", "posted"] },
        scheduledFor: { type: "string" },
        approvedBy: { type: "string" },
        postedUrl: { type: "string" },
      },
      required: ["id"],
    },
  },
  {
    name: "deleteContentPost",
    description: "Delete a content calendar post.",
    input_schema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
];

export type ToolName = (typeof AXIS_TOOLS)[number]["name"];

export async function runTool(
  name: string,
  input: Record<string, unknown>,
  actor: AxisActor = "system"
): Promise<unknown> {
  // The model has been told to honor input_schema. We trust the shape and forward.
  const i = input as unknown;
  try {
    const out = await runToolImpl(name, i);
    await audit({ actor, action: `tool:${name}`, payload: input, status: "ok" });
    return out;
  } catch (err) {
    await audit({
      actor,
      action: `tool:${name}`,
      payload: input,
      status: "error",
      message: (err as Error).message,
    });
    throw err;
  }
}

async function runToolImpl(name: string, input: unknown): Promise<unknown> {
  const i = input;
  switch (name) {
    case "createClient":
      return await createClient(i as Parameters<typeof createClient>[0]);
    case "createProject":
      return await createProject(i as Parameters<typeof createProject>[0]);
    case "createCampaign":
      return await createCampaign(i as Parameters<typeof createCampaign>[0]);
    case "createInvoice":
      return await createInvoice(i as Parameters<typeof createInvoice>[0]);
    case "generateCampaignPlan":
      return await generateCampaignPlan(i as Parameters<typeof generateCampaignPlan>[0]);
    case "generateContentCalendar":
      return await generateContentCalendar(i as Parameters<typeof generateContentCalendar>[0]);
    case "updateMemory":
      return await updateMemory(i as Parameters<typeof updateMemory>[0]);
    case "updateStatusPage":
      return await updateStatusPage();
    case "estimateTaxes":
      return await estimateTaxes(i as Parameters<typeof estimateTaxes>[0]);

    case "logExpense": {
      const i = input as {
        vendor: string;
        category: string;
        amountDollars: number;
        occurredAt?: string;
        notes?: string;
        taxDeductible?: boolean;
      };
      return await db.expense.create({
        data: {
          vendor: i.vendor,
          category: i.category,
          amountCents: dollarsToCents(i.amountDollars) ?? 0,
          occurredAt: i.occurredAt ? new Date(i.occurredAt) : new Date(),
          notes: i.notes,
          taxDeductible: i.taxDeductible ?? true,
        },
      });
    }

    case "logPayment": {
      const i = input as {
        clientName?: string;
        invoiceNumber?: string;
        amountDollars: number;
        method?: string;
        receivedAt?: string;
        notes?: string;
      };
      const cents = dollarsToCents(i.amountDollars) ?? 0;
      const invoice = i.invoiceNumber
        ? await db.invoice.findUnique({ where: { number: i.invoiceNumber } })
        : null;
      const client = i.clientName
        ? await db.client.findFirst({ where: { name: i.clientName } })
        : null;
      const payment = await db.payment.create({
        data: {
          amountCents: cents,
          invoiceId: invoice?.id,
          clientId: invoice?.clientId ?? client?.id,
          method: i.method,
          receivedAt: i.receivedAt ? new Date(i.receivedAt) : new Date(),
          notes: i.notes,
        },
      });
      if (invoice && cents >= invoice.amountCents) {
        await db.invoice.update({
          where: { id: invoice.id },
          data: { status: "paid", paidAt: payment.receivedAt },
        });
      }
      return { payment, markedPaid: !!invoice && cents >= invoice.amountCents };
    }

    case "createTask": {
      const i = input as {
        title: string;
        detail?: string;
        clientName?: string;
        projectName?: string;
        priority?: "low" | "normal" | "high" | "now";
        waitingOn?: string;
        dueDate?: string;
      };
      const client = i.clientName
        ? await db.client.findFirst({ where: { name: i.clientName } })
        : null;
      const project =
        i.projectName && client
          ? await db.project.findFirst({ where: { name: i.projectName, clientId: client.id } })
          : null;
      return await db.task.create({
        data: {
          title: i.title,
          detail: i.detail,
          clientId: client?.id,
          projectId: project?.id,
          priority: i.priority ?? "normal",
          waitingOn: i.waitingOn,
          dueDate: i.dueDate ? new Date(i.dueDate) : null,
        },
      });
    }

    case "listClients": {
      const i = input as { stage?: string };
      const clients = await db.client.findMany({
        where: i.stage ? { stage: i.stage } : undefined,
        orderBy: { name: "asc" },
        select: { id: true, name: true, stage: true, nextAction: true, handle: true },
      });
      return { clients };
    }

    case "listProjects": {
      const i = input as { clientName?: string; status?: string };
      const where: Record<string, unknown> = {};
      if (i.status) where.status = i.status;
      if (i.clientName) {
        const c = await db.client.findFirst({ where: { name: i.clientName } });
        if (c) where.clientId = c.id;
      }
      const projects = await db.project.findMany({
        where,
        include: { client: { select: { name: true } } },
        orderBy: { updatedAt: "desc" },
      });
      return { projects };
    }

    case "readWiki": {
      const i = input as { path: string };
      try {
        const content = await readWiki(i.path);
        return { path: i.path, content };
      } catch (e) {
        return { path: i.path, error: (e as Error).message };
      }
    }

    case "listWiki": {
      const i = input as { path?: string };
      const entries = await listWiki(i.path ?? "");
      return { path: i.path ?? "", entries };
    }

    // ---- Update / delete ----
    case "updateClient": {
      const i = input as { id: string; [k: string]: unknown };
      const data: Record<string, unknown> = {};
      if (i.name != null) data.name = i.name;
      if (i.handle != null) data.handle = i.handle;
      if (i.website != null) data.website = i.website;
      if (i.industry != null) data.industry = i.industry;
      if (i.stage != null) data.stage = i.stage;
      if (i.brandNotes != null) data.brandNotes = i.brandNotes;
      if (i.nextAction != null) data.nextAction = i.nextAction;
      if (i.retainerDollars != null) data.retainerCents = dollarsToCents(i.retainerDollars as number);
      return { client: await db.client.update({ where: { id: i.id }, data }) };
    }
    case "deleteClient": {
      const i = input as { id: string };
      await db.client.delete({ where: { id: i.id } });
      return { ok: true, deleted: i.id };
    }
    case "updateProject": {
      const i = input as { id: string; [k: string]: unknown };
      const data: Record<string, unknown> = {};
      if (i.name != null) data.name = i.name;
      if (i.status != null) data.status = i.status;
      if (i.brief != null) data.brief = i.brief;
      if (i.deliverables != null)
        data.deliverables = Array.isArray(i.deliverables) ? JSON.stringify(i.deliverables) : i.deliverables;
      if (i.budgetDollars != null) data.budgetCents = dollarsToCents(i.budgetDollars as number);
      if (i.startDate != null) data.startDate = i.startDate ? new Date(i.startDate as string) : null;
      if (i.dueDate != null) data.dueDate = i.dueDate ? new Date(i.dueDate as string) : null;
      if (i.risks != null) data.risks = i.risks;
      if (i.nextAction != null) data.nextAction = i.nextAction;
      return { project: await db.project.update({ where: { id: i.id }, data }) };
    }
    case "deleteProject": {
      const i = input as { id: string };
      await db.project.delete({ where: { id: i.id } });
      return { ok: true, deleted: i.id };
    }
    case "updateCampaign": {
      const i = input as { id: string; [k: string]: unknown };
      const data: Record<string, unknown> = {};
      if (i.name != null) data.name = i.name;
      if (i.concept != null) data.concept = i.concept;
      if (i.heroDirection != null) data.heroDirection = i.heroDirection;
      if (i.hooks != null) data.hooks = Array.isArray(i.hooks) ? (i.hooks as string[]).join("\n") : i.hooks;
      if (i.goals != null) data.goals = i.goals;
      if (i.status != null) data.status = i.status;
      if (i.startDate != null) data.startDate = i.startDate ? new Date(i.startDate as string) : null;
      if (i.endDate != null) data.endDate = i.endDate ? new Date(i.endDate as string) : null;
      return { campaign: await db.campaign.update({ where: { id: i.id }, data }) };
    }
    case "deleteCampaign": {
      const i = input as { id: string };
      await db.campaign.delete({ where: { id: i.id } });
      return { ok: true, deleted: i.id };
    }
    case "updateInvoice": {
      const i = input as { id: string; [k: string]: unknown };
      const data: Record<string, unknown> = {};
      if (i.status != null) {
        data.status = i.status;
        if (i.status === "paid") data.paidAt = new Date();
      }
      if (i.amountDollars != null) data.amountCents = dollarsToCents(i.amountDollars as number);
      if (i.dueDate != null) data.dueDate = i.dueDate ? new Date(i.dueDate as string) : null;
      if (i.notes != null) data.notes = i.notes;
      return { invoice: await db.invoice.update({ where: { id: i.id }, data }) };
    }
    case "deleteInvoice": {
      const i = input as { id: string };
      await db.invoice.delete({ where: { id: i.id } });
      return { ok: true, deleted: i.id };
    }
    case "updateExpense": {
      const i = input as { id: string; [k: string]: unknown };
      const data: Record<string, unknown> = {};
      if (i.vendor != null) data.vendor = i.vendor;
      if (i.category != null) data.category = i.category;
      if (i.amountDollars != null) data.amountCents = dollarsToCents(i.amountDollars as number);
      if (i.occurredAt != null) data.occurredAt = i.occurredAt ? new Date(i.occurredAt as string) : null;
      if (i.notes != null) data.notes = i.notes;
      if (i.taxDeductible != null) data.taxDeductible = i.taxDeductible;
      return { expense: await db.expense.update({ where: { id: i.id }, data }) };
    }
    case "deleteExpense": {
      const i = input as { id: string };
      await db.expense.delete({ where: { id: i.id } });
      return { ok: true, deleted: i.id };
    }
    case "updateTask": {
      const i = input as { id: string; [k: string]: unknown };
      const data: Record<string, unknown> = {};
      if (i.title != null) data.title = i.title;
      if (i.detail != null) data.detail = i.detail;
      if (i.status != null) {
        data.status = i.status;
        data.completedAt = i.status === "done" ? new Date() : null;
      }
      if (i.priority != null) data.priority = i.priority;
      if (i.waitingOn != null) data.waitingOn = (i.waitingOn as string) || null;
      if (i.dueDate != null) data.dueDate = i.dueDate ? new Date(i.dueDate as string) : null;
      return { task: await db.task.update({ where: { id: i.id }, data }) };
    }
    case "deleteTask": {
      const i = input as { id: string };
      await db.task.delete({ where: { id: i.id } });
      return { ok: true, deleted: i.id };
    }
    case "updateContentPost": {
      const i = input as { id: string; [k: string]: unknown };
      const data: Record<string, unknown> = {};
      if (i.platform != null) data.platform = i.platform;
      if (i.caption != null) data.caption = i.caption;
      if (i.hook != null) data.hook = i.hook;
      if (i.status != null) data.status = i.status;
      if (i.scheduledFor != null)
        data.scheduledFor = i.scheduledFor ? new Date(i.scheduledFor as string) : null;
      if (i.approvedBy != null) data.approvedBy = i.approvedBy;
      if (i.postedUrl != null) data.postedUrl = i.postedUrl;
      return { post: await db.contentCalendarPost.update({ where: { id: i.id }, data }) };
    }
    case "deleteContentPost": {
      const i = input as { id: string };
      await db.contentCalendarPost.delete({ where: { id: i.id } });
      return { ok: true, deleted: i.id };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
