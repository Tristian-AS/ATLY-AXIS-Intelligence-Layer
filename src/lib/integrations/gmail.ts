import { getAccessToken } from "./google-oauth";

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1";

function defaultUserEmail(): string {
  return process.env.AXIS_GMAIL_DEFAULT_USER ?? "tristian@atlystudios.com";
}

async function gmailFetch<T>(userEmail: string, path: string, init: RequestInit = {}): Promise<T> {
  const token = await getAccessToken(userEmail);
  const res = await fetch(`${GMAIL_API}/users/${encodeURIComponent(userEmail)}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    throw new Error(`Gmail ${path} → ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as T;
}

export interface GmailMessageSummary {
  id: string;
  threadId: string;
  snippet: string;
  subject: string;
  from: string;
  to: string;
  date: string;
  unread: boolean;
  starred: boolean;
}

interface RawMessage {
  id: string;
  threadId: string;
  snippet?: string;
  labelIds?: string[];
  payload?: { headers?: Array<{ name: string; value: string }> };
  internalDate?: string;
}

function headerValue(msg: RawMessage, name: string): string {
  const h = msg.payload?.headers?.find((x) => x.name.toLowerCase() === name.toLowerCase());
  return h?.value ?? "";
}

function summarize(msg: RawMessage): GmailMessageSummary {
  return {
    id: msg.id,
    threadId: msg.threadId,
    snippet: msg.snippet ?? "",
    subject: headerValue(msg, "Subject"),
    from: headerValue(msg, "From"),
    to: headerValue(msg, "To"),
    date: msg.internalDate
      ? new Date(parseInt(msg.internalDate, 10)).toISOString()
      : headerValue(msg, "Date"),
    unread: (msg.labelIds ?? []).includes("UNREAD"),
    starred: (msg.labelIds ?? []).includes("STARRED"),
  };
}

export interface ListInboxOptions {
  userEmail?: string;
  q?: string; // Gmail search syntax
  labelIds?: string[];
  maxResults?: number;
  includeSpamTrash?: boolean;
}

export async function gmailListMessages(opts: ListInboxOptions = {}): Promise<GmailMessageSummary[]> {
  const userEmail = opts.userEmail ?? defaultUserEmail();
  const params = new URLSearchParams();
  if (opts.q) params.set("q", opts.q);
  for (const l of opts.labelIds ?? ["INBOX"]) params.append("labelIds", l);
  params.set("maxResults", String(Math.min(opts.maxResults ?? 20, 100)));
  if (opts.includeSpamTrash) params.set("includeSpamTrash", "true");

  const list = await gmailFetch<{ messages?: Array<{ id: string; threadId: string }> }>(
    userEmail,
    `/messages?${params.toString()}`
  );
  const ids = list.messages ?? [];
  // Fetch each message in metadata format (headers + snippet only — cheap).
  const summaries = await Promise.all(
    ids.map((m) =>
      gmailFetch<RawMessage>(
        userEmail,
        `/messages/${m.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Date`
      )
    )
  );
  return summaries.map(summarize);
}

function decodeBase64Url(s: string): string {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  try {
    return Buffer.from(b64, "base64").toString("utf8");
  } catch {
    return "";
  }
}

interface FullMessagePart {
  mimeType?: string;
  body?: { data?: string; size?: number };
  parts?: FullMessagePart[];
}

function extractPlainText(part?: FullMessagePart): string {
  if (!part) return "";
  if (part.mimeType === "text/plain" && part.body?.data) {
    return decodeBase64Url(part.body.data);
  }
  for (const p of part.parts ?? []) {
    const t = extractPlainText(p);
    if (t) return t;
  }
  return "";
}

export interface GmailMessageFull extends GmailMessageSummary {
  body: string;
  cc: string;
  bcc: string;
}

export async function gmailGetMessage(opts: { id: string; userEmail?: string }): Promise<GmailMessageFull> {
  const userEmail = opts.userEmail ?? defaultUserEmail();
  const msg = await gmailFetch<RawMessage & { payload?: FullMessagePart & { headers?: Array<{ name: string; value: string }> } }>(
    userEmail,
    `/messages/${opts.id}?format=full`
  );
  const body = extractPlainText(msg.payload);
  return {
    ...summarize(msg),
    cc: headerValue(msg, "Cc"),
    bcc: headerValue(msg, "Bcc"),
    body,
  };
}

export async function gmailSearch(opts: { q: string; userEmail?: string; maxResults?: number }) {
  return gmailListMessages({
    userEmail: opts.userEmail,
    q: opts.q,
    maxResults: opts.maxResults,
  });
}
