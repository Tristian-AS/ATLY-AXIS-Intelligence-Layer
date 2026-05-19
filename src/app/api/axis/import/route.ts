import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { protect } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { createClient } from "@/lib/functions/createClient";
import { createProject } from "@/lib/functions/createProject";
import { createCampaign } from "@/lib/functions/createCampaign";
import { createInvoice } from "@/lib/functions/createInvoice";
import { dollarsToCents } from "@/lib/format";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

interface ImportPayload {
  clients?: Array<{
    name: string;
    handle?: string;
    website?: string;
    industry?: string;
    stage?: string;
    brandNotes?: string;
    nextAction?: string;
    retainerDollars?: number;
  }>;
  projects?: Array<{
    clientName: string;
    name: string;
    brief?: string;
    deliverables?: string[];
    budgetDollars?: number;
    startDate?: string;
    dueDate?: string;
    status?: string;
    nextAction?: string;
  }>;
  campaigns?: Array<{
    clientName: string;
    name: string;
    concept?: string;
    hooks?: string[];
    heroDirection?: string;
    goals?: string;
    status?: string;
  }>;
  invoices?: Array<{
    clientName: string;
    amountDollars: number;
    dueDate?: string;
    notes?: string;
    status?: string;
  }>;
  expenses?: Array<{
    vendor: string;
    category: string;
    amountDollars: number;
    occurredAt?: string;
    notes?: string;
    taxDeductible?: boolean;
  }>;
  tasks?: Array<{
    title: string;
    clientName?: string;
    detail?: string;
    priority?: string;
    waitingOn?: string;
    dueDate?: string;
    status?: string;
  }>;
  contentPosts?: Array<{
    clientName: string;
    campaignName?: string;
    platform: string;
    caption: string;
    hook?: string;
    scheduledFor?: string;
    status?: string;
  }>;
  memoryNotes?: Array<{
    title: string;
    body: string;
    scope?: string;
    clientName?: string;
    tags?: string[];
  }>;
}

interface Report {
  table: string;
  rowsReceived: number;
  rowsWritten: number;
  errors: Array<{ index: number; message: string }>;
}

/**
 * Bulk import endpoint. Accepts a single JSON payload with any subset of
 * domain arrays and inserts them in dependency order (clients first, then
 * everything that links to clients). Each section is best-effort — one bad
 * row doesn't abort the rest.
 *
 * Returns a per-table report so the caller (typically Lovable's
 * migrate-to-axis Edge Function) can verify counts.
 */
export const POST = protect(async (req: NextRequest, { actor }) => {
  const payload = (await req.json()) as ImportPayload;
  const reports: Report[] = [];

  // ---- 1. Clients (must go first so name-keyed lookups work) ----
  if (payload.clients?.length) {
    const r: Report = { table: "clients", rowsReceived: payload.clients.length, rowsWritten: 0, errors: [] };
    for (let i = 0; i < payload.clients.length; i++) {
      const c = payload.clients[i];
      try {
        // Idempotent: if a client with this name already exists, skip.
        const existing = await db.client.findFirst({ where: { name: c.name } });
        if (existing) {
          r.errors.push({ index: i, message: `already exists: ${c.name}` });
          continue;
        }
        await createClient({
          name: c.name,
          handle: c.handle,
          website: c.website,
          industry: c.industry,
          stage: (c.stage as "lead" | "active" | "paused" | "churned") ?? "lead",
          brandNotes: c.brandNotes,
          nextAction: c.nextAction,
          retainerDollars: c.retainerDollars,
        });
        r.rowsWritten++;
      } catch (err) {
        r.errors.push({ index: i, message: (err as Error).message });
      }
    }
    reports.push(r);
  }

  // ---- 2. Projects ----
  if (payload.projects?.length) {
    const r: Report = { table: "projects", rowsReceived: payload.projects.length, rowsWritten: 0, errors: [] };
    for (let i = 0; i < payload.projects.length; i++) {
      const p = payload.projects[i];
      try {
        await createProject({
          clientName: p.clientName,
          name: p.name,
          brief: p.brief,
          deliverables: p.deliverables,
          budgetDollars: p.budgetDollars,
          startDate: p.startDate,
          dueDate: p.dueDate,
          status: (p.status as "active" | "paused" | "done" | "stalled") ?? "active",
          nextAction: p.nextAction,
        });
        r.rowsWritten++;
      } catch (err) {
        r.errors.push({ index: i, message: (err as Error).message });
      }
    }
    reports.push(r);
  }

  // ---- 3. Campaigns ----
  if (payload.campaigns?.length) {
    const r: Report = { table: "campaigns", rowsReceived: payload.campaigns.length, rowsWritten: 0, errors: [] };
    for (let i = 0; i < payload.campaigns.length; i++) {
      const c = payload.campaigns[i];
      try {
        await createCampaign({
          clientName: c.clientName,
          name: c.name,
          concept: c.concept,
          hooks: c.hooks,
          heroDirection: c.heroDirection,
          goals: c.goals,
        });
        if (c.status && c.status !== "draft") {
          // createCampaign doesn't accept status; patch after.
          const created = await db.campaign.findFirst({
            where: { name: c.name },
            orderBy: { createdAt: "desc" },
          });
          if (created) {
            await db.campaign.update({ where: { id: created.id }, data: { status: c.status } });
          }
        }
        r.rowsWritten++;
      } catch (err) {
        r.errors.push({ index: i, message: (err as Error).message });
      }
    }
    reports.push(r);
  }

  // ---- 4. Invoices ----
  if (payload.invoices?.length) {
    const r: Report = { table: "invoices", rowsReceived: payload.invoices.length, rowsWritten: 0, errors: [] };
    for (let i = 0; i < payload.invoices.length; i++) {
      const inv = payload.invoices[i];
      try {
        const { invoice } = await createInvoice({
          clientName: inv.clientName,
          amountDollars: inv.amountDollars,
          dueDate: inv.dueDate,
          notes: inv.notes,
        });
        if (inv.status && inv.status !== "draft") {
          await db.invoice.update({
            where: { id: invoice.id },
            data: {
              status: inv.status,
              paidAt: inv.status === "paid" ? new Date() : null,
            },
          });
        }
        r.rowsWritten++;
      } catch (err) {
        r.errors.push({ index: i, message: (err as Error).message });
      }
    }
    reports.push(r);
  }

  // ---- 5. Expenses ----
  if (payload.expenses?.length) {
    const r: Report = { table: "expenses", rowsReceived: payload.expenses.length, rowsWritten: 0, errors: [] };
    for (let i = 0; i < payload.expenses.length; i++) {
      const e = payload.expenses[i];
      try {
        await db.expense.create({
          data: {
            vendor: e.vendor,
            category: e.category,
            amountCents: dollarsToCents(e.amountDollars) ?? 0,
            occurredAt: e.occurredAt ? new Date(e.occurredAt) : new Date(),
            notes: e.notes,
            taxDeductible: e.taxDeductible ?? true,
          },
        });
        r.rowsWritten++;
      } catch (err) {
        r.errors.push({ index: i, message: (err as Error).message });
      }
    }
    reports.push(r);
  }

  // ---- 6. Tasks ----
  if (payload.tasks?.length) {
    const r: Report = { table: "tasks", rowsReceived: payload.tasks.length, rowsWritten: 0, errors: [] };
    for (let i = 0; i < payload.tasks.length; i++) {
      const t = payload.tasks[i];
      try {
        const client = t.clientName
          ? await db.client.findFirst({ where: { name: t.clientName } })
          : null;
        await db.task.create({
          data: {
            title: t.title,
            detail: t.detail,
            clientId: client?.id,
            priority: t.priority ?? "normal",
            waitingOn: t.waitingOn,
            dueDate: t.dueDate ? new Date(t.dueDate) : null,
            status: t.status ?? "open",
            completedAt: t.status === "done" ? new Date() : null,
          },
        });
        r.rowsWritten++;
      } catch (err) {
        r.errors.push({ index: i, message: (err as Error).message });
      }
    }
    reports.push(r);
  }

  // ---- 7. Content posts ----
  if (payload.contentPosts?.length) {
    const r: Report = { table: "contentPosts", rowsReceived: payload.contentPosts.length, rowsWritten: 0, errors: [] };
    for (let i = 0; i < payload.contentPosts.length; i++) {
      const p = payload.contentPosts[i];
      try {
        const client = await db.client.findFirst({ where: { name: p.clientName } });
        if (!client) throw new Error(`unknown client: ${p.clientName}`);
        const campaign = p.campaignName
          ? await db.campaign.findFirst({ where: { name: p.campaignName, clientId: client.id } })
          : null;
        await db.contentCalendarPost.create({
          data: {
            clientId: client.id,
            campaignId: campaign?.id,
            platform: p.platform,
            caption: p.caption,
            hook: p.hook,
            scheduledFor: p.scheduledFor ? new Date(p.scheduledFor) : null,
            status: p.status ?? "draft",
          },
        });
        r.rowsWritten++;
      } catch (err) {
        r.errors.push({ index: i, message: (err as Error).message });
      }
    }
    reports.push(r);
  }

  // ---- 8. Memory notes ----
  if (payload.memoryNotes?.length) {
    const r: Report = { table: "memoryNotes", rowsReceived: payload.memoryNotes.length, rowsWritten: 0, errors: [] };
    for (let i = 0; i < payload.memoryNotes.length; i++) {
      const m = payload.memoryNotes[i];
      try {
        const client = m.clientName
          ? await db.client.findFirst({ where: { name: m.clientName } })
          : null;
        await db.memoryNote.create({
          data: {
            scope: m.scope ?? "general",
            clientId: client?.id,
            title: m.title,
            body: m.body,
            source: "import",
            tags: m.tags?.join(","),
          },
        });
        r.rowsWritten++;
      } catch (err) {
        r.errors.push({ index: i, message: (err as Error).message });
      }
    }
    reports.push(r);
  }

  await audit({
    actor,
    action: "api:POST /api/axis/import",
    payload: { reports: reports.map((r) => ({ table: r.table, rowsWritten: r.rowsWritten, errors: r.errors.length })) },
  });

  const totalWritten = reports.reduce((a, r) => a + r.rowsWritten, 0);
  const totalErrors = reports.reduce((a, r) => a + r.errors.length, 0);

  return NextResponse.json({
    ok: totalErrors === 0,
    totalWritten,
    totalErrors,
    reports,
  });
});
