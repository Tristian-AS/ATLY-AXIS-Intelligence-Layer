// Shared types between the Axis backend and atlystudios.ai's BFF.

export type ClientStage = "lead" | "active" | "paused" | "churned";
export type ProjectStatus = "active" | "paused" | "done" | "stalled";
export type CampaignStatus = "draft" | "live" | "wrapped";
export type InvoiceStatus = "draft" | "sent" | "paid" | "overdue" | "void";
export type TaskStatus = "open" | "doing" | "done" | "blocked";
export type TaskPriority = "low" | "normal" | "high" | "now";
export type Platform = "instagram" | "tiktok" | "youtube" | "x" | "linkedin" | "email";
export type ExpenseCategory =
  | "software"
  | "travel"
  | "meals"
  | "advertising"
  | "equipment"
  | "contract_labor"
  | "subscriptions"
  | "insurance"
  | "other";

export interface AxisClient {
  id: string;
  name: string;
  handle?: string | null;
  website?: string | null;
  industry?: string | null;
  stage: ClientStage;
  brandNotes?: string | null;
  nextAction?: string | null;
  retainerCents?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface AxisProject {
  id: string;
  clientId: string;
  name: string;
  status: ProjectStatus;
  brief?: string | null;
  deliverables?: string | null;
  budgetCents?: number | null;
  startDate?: string | null;
  dueDate?: string | null;
  risks?: string | null;
  nextAction?: string | null;
}

export interface AxisCampaign {
  id: string;
  clientId: string;
  projectId?: string | null;
  name: string;
  concept?: string | null;
  hooks?: string | null;
  heroDirection?: string | null;
  goals?: string | null;
  status: CampaignStatus;
  startDate?: string | null;
  endDate?: string | null;
}

export interface AxisInvoice {
  id: string;
  number: string;
  clientId: string;
  projectId?: string | null;
  amountCents: number;
  status: InvoiceStatus;
  issueDate: string;
  dueDate?: string | null;
  paidAt?: string | null;
  notes?: string | null;
}

export interface AxisExpense {
  id: string;
  vendor: string;
  category: ExpenseCategory;
  amountCents: number;
  occurredAt: string;
  notes?: string | null;
  taxDeductible: boolean;
}

export interface AxisTask {
  id: string;
  title: string;
  detail?: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  waitingOn?: string | null;
  dueDate?: string | null;
  completedAt?: string | null;
}

export interface AxisContentPost {
  id: string;
  clientId: string;
  campaignId?: string | null;
  platform: Platform;
  caption: string;
  hook?: string | null;
  scheduledFor?: string | null;
  status: "draft" | "approved" | "scheduled" | "posted";
}

export interface ToolActivity {
  name: string;
  input: unknown;
  output: unknown;
  error?: string;
}

export interface ChatReply {
  reply: string;
  toolActivity: ToolActivity[];
  threadId: string;
}

export interface StatusSummary {
  status: {
    updatedAt: string;
    counts: {
      activeClients: number;
      activeProjects: number;
      leads: number;
      outstandingInvoices: number;
      upcomingPosts: number;
    };
    money: { outstandingCents: number; expensesLast30Cents: number };
    nextActions: string[];
  };
  taxes: TaxEstimate;
}

export interface TaxEstimate {
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
  setAsidePct: number;
  grossRevenueCents: number;
  deductibleCents: number;
  taxableCents: number;
  estimateCents: number;
  byCategory: Record<string, number>;
  savedId: string | null;
}

export interface HealthResponse {
  ok: boolean;
  dbOk: boolean;
  dbError?: string;
  anthropicConfigured: boolean;
  tokenConfigured: boolean;
  version: string;
  timestamp: string;
}

export type SseEvent =
  | { event: "delta"; data: { chunk: string } }
  | { event: "tool"; data: ToolActivity }
  | { event: "done"; data: ChatReply }
  | { event: "error"; data: { message: string } };
