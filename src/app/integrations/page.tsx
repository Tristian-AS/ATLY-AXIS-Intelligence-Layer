import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/Card";
import { db } from "@/lib/prisma";
import { shortDate } from "@/lib/format";

export const dynamic = "force-dynamic";

interface IntegrationCheck {
  name: string;
  envOk: boolean;
  envMissing: string[];
  status: "configured" | "missing-env" | "connected" | "needs-connect";
  detail?: string;
}

function envCheck(...names: string[]): { envOk: boolean; envMissing: string[] } {
  const missing = names.filter((n) => !process.env[n]);
  return { envOk: missing.length === 0, envMissing: missing };
}

export default async function IntegrationsPage() {
  const stripe: IntegrationCheck = {
    name: "Stripe",
    ...envCheck("STRIPE_SECRET_KEY"),
    status: "configured",
  };
  stripe.status = stripe.envOk ? "configured" : "missing-env";

  const ga4: IntegrationCheck = {
    name: "Google Analytics 4",
    ...envCheck("GOOGLE_SERVICE_ACCOUNT_JSON", "GA4_PROPERTY_ID"),
    status: "configured",
  };
  ga4.status = ga4.envOk ? "configured" : "missing-env";

  const cal: IntegrationCheck = {
    name: "Google Calendar (service account)",
    ...envCheck("GOOGLE_SERVICE_ACCOUNT_JSON", "GOOGLE_CALENDAR_ID"),
    status: "configured",
  };
  cal.status = cal.envOk ? "configured" : "missing-env";

  const resend: IntegrationCheck = {
    name: "Email (Resend)",
    ...envCheck("RESEND_API_KEY"),
    status: "configured",
  };
  resend.status = resend.envOk ? "configured" : "missing-env";

  // Gmail = OAuth-backed. Env vars for the OAuth client + at least one
  // stored token row.
  const gmailEnv = envCheck("GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET", "AXIS_PUBLIC_URL");
  const gmailAccounts = gmailEnv.envOk
    ? await db.googleOAuthToken.findMany({ orderBy: { createdAt: "asc" } })
    : [];

  const gmail: IntegrationCheck & { accounts: typeof gmailAccounts } = {
    name: "Gmail (OAuth)",
    ...gmailEnv,
    status: !gmailEnv.envOk
      ? "missing-env"
      : gmailAccounts.length > 0
        ? "connected"
        : "needs-connect",
    accounts: gmailAccounts,
  };

  return (
    <div>
      <PageHeader
        eyebrow="Integrations"
        title="External systems wired into Axis."
        description="Stripe, Google Analytics, Calendar, Email, Gmail. Each one becomes a tool Claude can call from chat."
      />

      <div className="space-y-4">
        <IntegrationRow check={stripe}>
          <p className="text-sm text-ink-300">
            Reads charges + balance. Marks Axis invoices paid on matched charges. Writable (refunds).
          </p>
          <Chat prompt="Sync Stripe payments from the last 30 days." />
        </IntegrationRow>

        <IntegrationRow check={ga4}>
          <p className="text-sm text-ink-300">
            Pulls sessions, users, page views, conversions, revenue from a GA4 property.
          </p>
          <Chat prompt="Pull a GA4 snapshot for the last 28 days and save it." />
        </IntegrationRow>

        <IntegrationRow check={cal}>
          <p className="text-sm text-ink-300">
            Reads upcoming events from a calendar shared with the service-account email.
          </p>
          <Chat prompt="What shoots are on the calendar this week?" />
        </IntegrationRow>

        <IntegrationRow check={resend}>
          <p className="text-sm text-ink-300">
            Sends ad-hoc emails + invoice emails through Resend. Requires verified domain.
          </p>
          <Chat prompt="Email invoice ATLY-2026-0001 to the client." />
        </IntegrationRow>

        <IntegrationRow check={gmail}>
          <p className="text-sm text-ink-300">
            Read your inbox, search messages, draft summaries. Connect once, persists.
          </p>

          {gmail.status === "needs-connect" ? (
            <a
              href="/api/axis/integrations/google/connect"
              className="mt-3 inline-block rounded-md border border-signal-accent/40 bg-signal-accent/10 px-4 py-2 text-xs uppercase tracking-[0.25em] text-signal-accent transition hover:bg-signal-accent/20"
            >
              Connect Gmail →
            </a>
          ) : null}

          {gmail.accounts.length > 0 ? (
            <div className="mt-4 space-y-2">
              <div className="text-[10px] uppercase tracking-[0.3em] text-ink-400">Connected accounts</div>
              <ul className="divide-y divide-ink-700/60">
                {gmail.accounts.map((a) => (
                  <li key={a.id} className="flex items-center justify-between py-2 text-sm">
                    <span className="text-signal">{a.userEmail}</span>
                    <span className="text-[10px] uppercase tracking-widest text-ink-400">
                      since {shortDate(a.createdAt)} · {a.scopes.split(/\s+/).filter(Boolean).length} scopes
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {gmail.status === "connected" ? (
            <Chat prompt="What's in my inbox from the last 3 days that's worth attention?" />
          ) : null}
        </IntegrationRow>
      </div>
    </div>
  );
}

function IntegrationRow({
  check,
  children,
}: {
  check: IntegrationCheck;
  children: React.ReactNode;
}) {
  return (
    <Card eyebrow={check.name} title="" className="!p-5">
      <div className="flex items-start justify-between gap-6">
        <div className="flex-1">{children}</div>
        <StatusBadge status={check.status} />
      </div>

      {check.status === "missing-env" ? (
        <div className="mt-3 rounded border border-flag-warn/40 bg-flag-warn/5 p-3 text-xs text-flag-warn">
          Missing env vars in Vercel:{" "}
          <code className="font-mono">{check.envMissing.join(", ")}</code>
        </div>
      ) : null}
    </Card>
  );
}

function StatusBadge({ status }: { status: IntegrationCheck["status"] }) {
  const map: Record<IntegrationCheck["status"], { color: string; label: string }> = {
    configured: { color: "border-flag-ok/40 text-flag-ok", label: "configured" },
    connected: { color: "border-flag-ok/40 text-flag-ok", label: "connected" },
    "needs-connect": { color: "border-signal-accent/40 text-signal-accent", label: "needs connect" },
    "missing-env": { color: "border-flag-warn/40 text-flag-warn", label: "missing env" },
  };
  const m = map[status];
  return (
    <span className={`rounded border px-2 py-0.5 text-[10px] uppercase tracking-widest ${m.color}`}>
      {m.label}
    </span>
  );
}

function Chat({ prompt }: { prompt: string }) {
  return (
    <a
      href={`/chat?seed=${encodeURIComponent(prompt)}`}
      className="mt-3 inline-block text-[11px] uppercase tracking-[0.3em] text-ink-300 hover:text-signal-accent"
    >
      Try in chat: <span className="text-signal-accent">{prompt}</span> →
    </a>
  );
}
