"use client";

import { useEffect, useState } from "react";
import { clsx } from "clsx";

type StepStatus = "ok" | "missing" | "checking" | "unknown";

interface HealthResponse {
  ok: boolean;
  deployment?: { vercelEnv?: string; gitCommitSha?: string };
  integrations?: {
    resend?: {
      configured?: boolean;
      hasFromAddress?: boolean;
      hasReplyTo?: boolean;
    };
  };
}

const VERCEL_ENV_URL =
  "https://vercel.com/dashboard"; // user clicks into their project from here
const RESEND_KEYS_URL = "https://resend.com/api-keys";
const RESEND_DOMAINS_URL = "https://resend.com/domains";

export default function SetupEmailPage() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [to, setTo] = useState("tristian@atlystudios.com");
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<
    | null
    | { ok: true; messageId: string; to: string | string[]; subject: string }
    | { ok: false; error: string }
  >(null);

  async function refresh() {
    setLoading(true);
    try {
      const res = await fetch("/api/health");
      const data = (await res.json()) as HealthResponse;
      setHealth(data);
    } catch {
      setHealth(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function sendTest() {
    if (!to.trim() || sending) return;
    setSending(true);
    setSendResult(null);
    try {
      const res = await fetch("/api/axis/setup/test-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to }),
      });
      const data = await res.json();
      setSendResult(data);
    } catch (err) {
      setSendResult({ ok: false, error: (err as Error).message });
    } finally {
      setSending(false);
    }
  }

  const step1: StepStatus = loading
    ? "checking"
    : health?.integrations?.resend?.configured
      ? "ok"
      : "missing";
  const step2: StepStatus = loading
    ? "checking"
    : health?.integrations?.resend?.hasFromAddress
      ? "ok"
      : "missing";
  // Step 3 (domain) is hard to verify without an extra Resend API call. We
  // gate on the test-send error message instead — if the send fails with a
  // "domain not verified" error, we light it up red.
  const step3: StepStatus =
    sendResult && "error" in sendResult && /domain.*verif/i.test(sendResult.error)
      ? "missing"
      : sendResult && "ok" in sendResult && sendResult.ok
        ? "ok"
        : "unknown";
  const step4: StepStatus =
    sendResult && "ok" in sendResult && sendResult.ok
      ? "ok"
      : sendResult
        ? "missing"
        : "unknown";

  return (
    <div>
      <div className="mb-10 flex items-end justify-between gap-8 border-b atly-hairline pb-6">
        <div>
          <div className="mb-3 text-[10px] uppercase tracking-[0.4em] text-signal-accent">
            Setup · Email
          </div>
          <h1 className="font-display text-4xl tracking-tight text-signal">
            Wire up email send.
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-300">
            Four checkpoints. Get each green, then send a live test to confirm
            the whole pipeline works.
          </p>
        </div>
        <button
          onClick={refresh}
          className="rounded-md border border-ink-700/60 px-4 py-2 text-xs uppercase tracking-[0.25em] text-ink-200 transition hover:border-signal-accent/40 hover:text-signal-accent"
        >
          Recheck
        </button>
      </div>

      <Step
        n={1}
        status={step1}
        title="Resend API key in Vercel env"
        body={
          <>
            <p className="text-sm text-ink-200">
              Axis needs a Resend API key to dispatch mail. Vercel env var
              name: <code className="font-mono text-signal">RESEND_API_KEY</code>.
            </p>
            <ul className="mt-3 space-y-2 text-sm text-ink-300">
              <li>
                <a href={RESEND_KEYS_URL} target="_blank" rel="noopener noreferrer" className="text-signal-accent hover:underline">
                  resend.com/api-keys →
                </a>{" "}
                — create a key named <code className="font-mono">axis-vercel</code>, copy the <code className="font-mono">re_...</code> value.
              </li>
              <li>
                <a href={VERCEL_ENV_URL} target="_blank" rel="noopener noreferrer" className="text-signal-accent hover:underline">
                  Vercel → your project → Settings → Environment Variables →
                </a>{" "}
                add <code className="font-mono">RESEND_API_KEY</code>, paste the value, check all three environment scopes.
              </li>
              <li>Wait for redeploy, then click <span className="text-signal">Recheck</span> above.</li>
            </ul>
          </>
        }
      />

      <Step
        n={2}
        status={step2}
        title="Sender address configured"
        body={
          <>
            <p className="text-sm text-ink-200">
              Optional but recommended: set the default from-address. Without
              it, Axis falls back to <code className="font-mono">ATLY Studios &lt;axis@atlystudios.com&gt;</code>.
            </p>
            <ul className="mt-3 space-y-2 text-sm text-ink-300">
              <li>
                Vercel env vars → add <code className="font-mono text-signal">AXIS_EMAIL_FROM</code> with value{" "}
                <code className="font-mono">ATLY Studios &lt;axis@atlystudios.com&gt;</code> (or your preferred address).
              </li>
              <li>
                Optional: <code className="font-mono text-signal">AXIS_EMAIL_REPLY_TO</code> set to a real inbox
                you read (replies route there).
              </li>
            </ul>
          </>
        }
      />

      <Step
        n={3}
        status={step3}
        title="Sender domain verified in Resend"
        body={
          <>
            <p className="text-sm text-ink-200">
              Resend rejects all sends until the from-address's domain has
              SPF / DKIM / DMARC records added. This is the most common cause
              of "Credential not found" / "domain not verified" errors.
            </p>
            <ul className="mt-3 space-y-2 text-sm text-ink-300">
              <li>
                <a href={RESEND_DOMAINS_URL} target="_blank" rel="noopener noreferrer" className="text-signal-accent hover:underline">
                  resend.com/domains →
                </a>{" "}
                Add Domain → <code className="font-mono">atlystudios.com</code> (or your preferred sender domain).
              </li>
              <li>Copy the three DNS records Resend shows you (SPF, DKIM, DMARC) into your DNS provider.</li>
              <li>Wait 5–30 min for verification. Status flips to green in Resend's dashboard.</li>
              <li>This step has no live env check — only a real test-send below will reveal it.</li>
            </ul>
          </>
        }
      />

      <Step
        n={4}
        status={step4}
        title="Send a live test"
        body={
          <>
            <p className="text-sm text-ink-200">
              Fires a real email through your live key. The response (success
              or exact Resend error) shows up below in plain English.
            </p>
            <div className="mt-4 flex items-end gap-3">
              <div className="flex-1">
                <label className="block text-[10px] uppercase tracking-[0.3em] text-ink-400 mb-2">
                  Recipient
                </label>
                <input
                  type="email"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="w-full rounded-md border border-ink-700/60 bg-ink-900/80 px-3 py-2 text-sm text-ink-100 focus:border-signal-accent/60 focus:outline-none"
                />
              </div>
              <button
                onClick={sendTest}
                disabled={sending || !to.trim()}
                className="rounded-md border border-signal-accent/40 bg-signal-accent/10 px-5 py-2 text-xs uppercase tracking-[0.25em] text-signal-accent transition hover:bg-signal-accent/20 disabled:opacity-40"
              >
                {sending ? "Sending…" : "Send test"}
              </button>
            </div>
            {sendResult ? (
              "ok" in sendResult && sendResult.ok ? (
                <div className="mt-4 rounded border border-flag-ok/40 bg-flag-ok/5 p-4 text-sm">
                  <div className="text-flag-ok font-medium">✓ Sent.</div>
                  <div className="mt-1 text-ink-200">
                    Resend accepted message <code className="font-mono">{sendResult.messageId}</code>. Check{" "}
                    <span className="text-signal">{to}</span> — should arrive within 30 seconds.
                  </div>
                </div>
              ) : (
                <div className="mt-4 rounded border border-flag-danger/40 bg-flag-danger/5 p-4 text-sm">
                  <div className="text-flag-danger font-medium">✗ Send failed.</div>
                  <pre className="mt-2 whitespace-pre-wrap text-xs text-ink-200">{sendResult.error}</pre>
                  <div className="mt-3 text-xs text-ink-300">
                    {hintForError(sendResult.error)}
                  </div>
                </div>
              )
            ) : null}
          </>
        }
      />
    </div>
  );
}

function Step({
  n,
  status,
  title,
  body,
}: {
  n: number;
  status: StepStatus;
  title: string;
  body: React.ReactNode;
}) {
  const statusColor =
    status === "ok"
      ? "border-flag-ok/40 text-flag-ok"
      : status === "missing"
        ? "border-flag-danger/40 text-flag-danger"
        : status === "checking"
          ? "border-ink-600 text-ink-300"
          : "border-ink-700 text-ink-400";
  const statusLabel =
    status === "ok"
      ? "ok"
      : status === "missing"
        ? "needs fix"
        : status === "checking"
          ? "checking"
          : "—";

  return (
    <section className="mb-6 rounded-lg border border-ink-700/60 bg-ink-900/40 p-6 shadow-film">
      <header className="mb-4 flex items-start justify-between">
        <div className="flex items-start gap-4">
          <div className="mt-1 flex h-7 w-7 items-center justify-center rounded-full border border-ink-700/60 text-xs text-ink-300">
            {n}
          </div>
          <h2 className="font-display text-xl tracking-tight text-signal">{title}</h2>
        </div>
        <span className={clsx("rounded border px-2 py-0.5 text-[10px] uppercase tracking-widest", statusColor)}>
          {statusLabel}
        </span>
      </header>
      <div className="pl-11">{body}</div>
    </section>
  );
}

function hintForError(error: string): string {
  const e = error.toLowerCase();
  if (e.includes("credential not found") || e.includes("api_key")) {
    return "Resend doesn't recognize the API key. Step 1: rotate the key in Resend → paste the new value into Vercel → redeploy.";
  }
  if (/domain.*verif/i.test(error) || e.includes("from address")) {
    return "Resend rejected the from-address. Step 3: add the domain in resend.com/domains and complete the DNS records.";
  }
  if (e.includes("resend_api_key not configured")) {
    return "The function can't see RESEND_API_KEY. Step 1: confirm it's saved on the right environment scope in Vercel, then redeploy.";
  }
  if (e.includes("invalid recipient") || e.includes("to")) {
    return "Check the recipient email is well-formed.";
  }
  return "Copy the error above and paste it back to Claude — I'll map it to a specific fix.";
}
