/**
 * dailyBrief — one-call survey of the whole business.
 *
 * Pulls in parallel from:
 *   - Postgres: open tasks, active projects, outstanding invoices, recent payments,
 *               recent memory notes
 *   - Gmail (if OAuth connected): last N hours of inbox
 *   - Google Calendar (if OAuth connected): next 7 days of events
 *   - Stripe (if configured): recent charges + balance
 *   - GA4 (if configured): last 7 days totals
 *
 * Each section is independent — if a credential is missing or a fetch fails,
 * the section reports its error but the rest of the brief still returns.
 *
 * Optional: persist the brief as a journal memory_note so Axis has a history
 * of daily briefs to refer back to.
 */

import { db } from "@/lib/prisma";
import { updateMemory } from "./updateMemory";
import { estimateTaxes } from "./estimateTaxes";

export interface DailyBriefOptions {
  /** Hours of inbox to scan. Default 24. */
  inboxHours?: number;
  /** Days of calendar ahead. Default 7. */
  calendarDays?: number;
  /** Persist this brief as a journal memory_note. */
  persist?: boolean;
  /** Override default user email for Gmail/Calendar OAuth lookup. */
  userEmail?: string;
  /** Skip specific sections (saves time + cost). */
  skip?: Array<
    | "tasks"
    | "projects"
    | "invoices"
    | "payments"
    | "memory"
    | "gmail"
    | "calendar"
    | "stripe"
    | "ga4"
    | "taxes"
    | "lovable"
  >;
}

interface SectionResult<T> {
  data: T | null;
  error?: string;
  skipped?: boolean;
}

function ok<T>(data: T): SectionResult<T> {
  return { data };
}
function fail(error: string): SectionResult<never> {
  return { data: null, error };
}
function skipped(): SectionResult<never> {
  return { data: null, skipped: true };
}

export async function dailyBrief(opts: DailyBriefOptions = {}) {
  const skip = new Set(opts.skip ?? []);
  const inboxHours = opts.inboxHours ?? 24;
  const calendarDays = opts.calendarDays ?? 7;
  const since = new Date(Date.now() - inboxHours * 3600 * 1000);
  const ahead = new Date(Date.now() + calendarDays * 86_400 * 1000);

  const [
    tasksR,
    projectsR,
    invoicesR,
    paymentsR,
    memoryR,
    gmailR,
    calendarR,
    stripeR,
    taxesR,
    lovableR,
  ] = await Promise.all([
    // Tasks — open + doing + blocked
    skip.has("tasks")
      ? Promise.resolve(skipped())
      : db.task
          .findMany({
            where: { status: { in: ["open", "doing", "blocked"] } },
            include: {
              client: { select: { name: true } },
              project: { select: { name: true } },
            },
            orderBy: [{ priority: "desc" }, { dueDate: "asc" }, { createdAt: "desc" }],
            take: 50,
          })
          .then(ok)
          .catch((e: Error) => fail(e.message)),

    // Projects — active + stalled
    skip.has("projects")
      ? Promise.resolve(skipped())
      : db.project
          .findMany({
            where: { status: { in: ["active", "stalled"] } },
            include: { client: { select: { name: true } } },
            orderBy: { dueDate: "asc" },
            take: 25,
          })
          .then(ok)
          .catch((e: Error) => fail(e.message)),

    // Outstanding invoices
    skip.has("invoices")
      ? Promise.resolve(skipped())
      : db.invoice
          .findMany({
            where: { status: { in: ["sent", "overdue"] } },
            include: { client: { select: { name: true } } },
            orderBy: { dueDate: "asc" },
          })
          .then(ok)
          .catch((e: Error) => fail(e.message)),

    // Payments in window
    skip.has("payments")
      ? Promise.resolve(skipped())
      : db.payment
          .findMany({
            where: { receivedAt: { gte: since } },
            orderBy: { receivedAt: "desc" },
            include: { client: { select: { name: true } } },
            take: 20,
          })
          .then(ok)
          .catch((e: Error) => fail(e.message)),

    // Recent memory notes (last 14 days)
    skip.has("memory")
      ? Promise.resolve(skipped())
      : db.memoryNote
          .findMany({
            where: { createdAt: { gte: new Date(Date.now() - 14 * 86_400 * 1000) } },
            orderBy: { createdAt: "desc" },
            take: 10,
          })
          .then(ok)
          .catch((e: Error) => fail(e.message)),

    // Gmail
    skip.has("gmail")
      ? Promise.resolve(skipped())
      : (async () => {
          try {
            const { gmailListMessages } = await import("@/lib/integrations/gmail");
            const messages = await gmailListMessages({
              userEmail: opts.userEmail,
              q: `newer_than:${Math.ceil(inboxHours / 24) || 1}d`,
              maxResults: 30,
            });
            return ok({ messages, scannedHours: inboxHours });
          } catch (e) {
            return fail((e as Error).message);
          }
        })(),

    // Calendar — try OAuth first (richer access to user's actual calendar),
    // fall back to service-account if OAuth isn't connected.
    skip.has("calendar")
      ? Promise.resolve(skipped())
      : (async () => {
          try {
            const { listCalendarEventsOAuth } = await import(
              "@/lib/integrations/google-calendar-oauth"
            );
            const events = await listCalendarEventsOAuth({
              userEmail: opts.userEmail,
              timeMin: new Date().toISOString(),
              timeMax: ahead.toISOString(),
              maxResults: 25,
            });
            return ok({ source: "oauth", events, windowDays: calendarDays });
          } catch (oauthErr) {
            try {
              const { listCalendarEvents } = await import(
                "@/lib/integrations/google-calendar"
              );
              const events = await listCalendarEvents({
                timeMin: new Date().toISOString(),
                timeMax: ahead.toISOString(),
                maxResults: 25,
              });
              return ok({ source: "service-account", events, windowDays: calendarDays });
            } catch (saErr) {
              return fail(
                `OAuth: ${(oauthErr as Error).message} | service-account: ${(saErr as Error).message}`
              );
            }
          }
        })(),

    // Stripe — balance + recent charges
    skip.has("stripe")
      ? Promise.resolve(skipped())
      : (async () => {
          try {
            const { stripeRecentCharges, stripeBalance } = await import(
              "@/lib/integrations/stripe"
            );
            const [charges, balance] = await Promise.all([
              stripeRecentCharges({ limit: 10 }),
              stripeBalance(),
            ]);
            return ok({ charges, balance });
          } catch (e) {
            return fail((e as Error).message);
          }
        })(),

    // Taxes — current quarter snapshot
    skip.has("taxes")
      ? Promise.resolve(skipped())
      : estimateTaxes()
          .then(ok)
          .catch((e: Error) => fail(e.message)),

    // Lovable Supabase live-read — what the Lovable UI dashboard is showing
    skip.has("lovable")
      ? Promise.resolve(skipped())
      : (async () => {
          try {
            const { lovableSnapshot } = await import(
              "@/lib/integrations/lovable-supabase"
            );
            const snap = await lovableSnapshot();
            return ok(snap);
          } catch (e) {
            return fail((e as Error).message);
          }
        })(),
  ]);

  // ---- compute headline rollups ----
  const tasks = tasksR.data ?? [];
  const projects = projectsR.data ?? [];
  const invoices = invoicesR.data ?? [];
  const payments = paymentsR.data ?? [];

  const tasksNow = tasks.filter((t) => t.priority === "now");
  const tasksDueSoon = tasks.filter(
    (t) => t.dueDate && t.dueDate.getTime() <= Date.now() + 3 * 86_400 * 1000
  );
  const blockedTasks = tasks.filter((t) => t.status === "blocked" && t.waitingOn);
  const overdue = invoices.filter((i) => i.dueDate && i.dueDate.getTime() < Date.now());
  const outstandingCents = invoices.reduce((a, i) => a + i.amountCents, 0);
  const paymentsCents = payments.reduce((a, p) => a + p.amountCents, 0);

  const summary = {
    tasks: { total: tasks.length, now: tasksNow.length, dueSoon: tasksDueSoon.length, blocked: blockedTasks.length },
    projects: { active: projects.filter((p) => p.status === "active").length, stalled: projects.filter((p) => p.status === "stalled").length },
    money: {
      outstandingCents,
      overdueCount: overdue.length,
      paymentsInWindowCents: paymentsCents,
    },
    inbox:
      gmailR.data && "messages" in gmailR.data
        ? { count: gmailR.data.messages.length, scannedHours: gmailR.data.scannedHours }
        : null,
    calendar:
      calendarR.data && "events" in calendarR.data
        ? { count: calendarR.data.events.length, windowDays: calendarR.data.windowDays, source: calendarR.data.source }
        : null,
    stripe:
      stripeR.data && "balance" in stripeR.data && stripeR.data.balance && "available" in stripeR.data.balance
        ? {
            availableCents: (stripeR.data.balance as { available: number }).available,
            pendingCents: (stripeR.data.balance as { pending: number }).pending,
            recentChargeCount: stripeR.data.charges?.length ?? 0,
          }
        : null,
  };

  const result = {
    generatedAt: new Date().toISOString(),
    summary,
    sections: {
      tasks: tasksR,
      projects: projectsR,
      invoices: invoicesR,
      payments: paymentsR,
      memory: memoryR,
      gmail: gmailR,
      calendar: calendarR,
      stripe: stripeR,
      taxes: taxesR,
      lovable: lovableR,
    },
  };

  if (opts.persist) {
    try {
      const today = new Date().toISOString().slice(0, 10);
      await updateMemory({
        scope: "general",
        title: `Daily brief — ${today}`,
        body: JSON.stringify(summary, null, 2),
        tags: ["daily-brief"],
        source: "chat",
        wikiPath: `journal/${today}-brief.md`,
        mode: "replace",
      });
    } catch {
      /* persist failure shouldn't kill the brief */
    }
  }

  return result;
}
