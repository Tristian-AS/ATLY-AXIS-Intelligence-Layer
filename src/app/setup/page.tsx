import Link from "next/link";
import { headers } from "next/headers";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/Card";

export const dynamic = "force-dynamic";

interface HealthResponse {
  deployment?: { vercelEnv?: string; gitCommitSha?: string };
  integrations?: {
    anthropic?: { configured?: boolean };
    axisToken?: { configured?: boolean };
    database?: { hasDatabaseUrl?: boolean; hasDirectUrl?: boolean };
    stripe?: { configured?: boolean };
    resend?: { configured?: boolean; hasFromAddress?: boolean };
    ga4?: { configured?: boolean };
    calendar?: { configured?: boolean };
    googleOAuth?: { configured?: boolean };
  };
}

async function getHealth(): Promise<HealthResponse | null> {
  // Build an absolute URL from the request headers so the server component
  // can call its own /api/health route during render.
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return null;
  try {
    const res = await fetch(`${proto}://${host}/api/health`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as HealthResponse;
  } catch {
    return null;
  }
}

interface RowProps {
  name: string;
  blurb: string;
  status: "ready" | "needs-config" | "available-later";
  href?: string;
  envHint?: string;
}

function statusBadge(status: RowProps["status"]) {
  if (status === "ready")
    return { label: "ready", className: "border-flag-ok/40 text-flag-ok" };
  if (status === "needs-config")
    return { label: "needs config", className: "border-flag-warn/40 text-flag-warn" };
  return { label: "coming soon", className: "border-ink-600 text-ink-400" };
}

export default async function SetupHubPage() {
  const health = await getHealth();
  const ig = health?.integrations ?? {};

  const rows: RowProps[] = [
    {
      name: "Email send",
      blurb: "Tristian asks 'email Ed', an email actually sends. Resend + verified domain.",
      status: ig.resend?.configured ? "needs-config" : "needs-config",
      href: "/setup/email",
      envHint: ig.resend?.configured ? "Key set; test-send still needed" : "RESEND_API_KEY missing",
    },
    {
      name: "Stripe data",
      blurb: "Pull real revenue + charges from the live Stripe account.",
      status: ig.stripe?.configured ? "ready" : "needs-config",
      envHint: ig.stripe?.configured ? "STRIPE_SECRET_KEY set" : "STRIPE_SECRET_KEY missing",
    },
    {
      name: "Google Calendar (write)",
      blurb: "Create / edit / delete events on your calendar via Axis chat.",
      status: ig.googleOAuth?.configured ? "ready" : "needs-config",
      envHint: ig.googleOAuth?.configured
        ? "OAuth client set; user consent + calendar.events scope still needed"
        : "OAuth client env vars missing",
    },
    {
      name: "Gmail read",
      blurb: "List inbox, search, read messages.",
      status: ig.googleOAuth?.configured ? "ready" : "needs-config",
      envHint: ig.googleOAuth?.configured
        ? "OAuth client set; user consent needed"
        : "OAuth client env vars missing",
    },
    {
      name: "Google Analytics 4",
      blurb: "Pull sessions, users, page views, conversions, revenue.",
      status: ig.ga4?.configured ? "ready" : "needs-config",
      envHint: ig.ga4?.configured ? "Service account + property id set" : "GOOGLE_SERVICE_ACCOUNT_JSON or GA4_PROPERTY_ID missing",
    },
    {
      name: "Lovable Supabase (live read)",
      blurb: "Read the 7 clients / 5 projects / etc. directly from Lovable's DB.",
      status: "needs-config",
      envHint: "LOVABLE_SUPABASE_DB_URL not detected in /api/health (no probe yet)",
    },
  ];

  const deployment = health?.deployment;

  return (
    <div>
      <PageHeader
        eyebrow="Setup"
        title="Configuration wizard."
        description="One integration at a time. Get each one fully working before moving on. Status detected from the live deployment."
        right={
          deployment ? (
            <div className="text-right text-[10px] uppercase tracking-[0.3em] text-ink-400">
              <div>{deployment.vercelEnv}</div>
              <div className="mt-1 text-ink-300">
                <code className="font-mono">{deployment.gitCommitSha}</code>
              </div>
            </div>
          ) : null
        }
      />

      <div className="space-y-3">
        {rows.map((row) => {
          const badge = statusBadge(row.status);
          const inner = (
            <Card className="!p-5">
              <div className="flex items-start justify-between gap-6">
                <div className="flex-1">
                  <div className="font-display text-lg text-signal">{row.name}</div>
                  <p className="mt-1 text-sm text-ink-300">{row.blurb}</p>
                  {row.envHint ? (
                    <div className="mt-2 text-[10px] uppercase tracking-widest text-ink-400">
                      {row.envHint}
                    </div>
                  ) : null}
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`rounded border px-2 py-0.5 text-[10px] uppercase tracking-widest ${badge.className}`}
                  >
                    {badge.label}
                  </span>
                  {row.href ? (
                    <span className="text-signal-accent">→</span>
                  ) : null}
                </div>
              </div>
            </Card>
          );
          return row.href ? (
            <Link key={row.name} href={row.href} className="block">
              {inner}
            </Link>
          ) : (
            <div key={row.name}>{inner}</div>
          );
        })}
      </div>

      <p className="mt-10 text-xs text-ink-400">
        Only Email has a guided walkthrough right now. The rest will get one once Email
        is demonstrably working end-to-end.
      </p>
    </div>
  );
}
