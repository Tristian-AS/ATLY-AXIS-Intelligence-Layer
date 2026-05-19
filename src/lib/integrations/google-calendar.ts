import { GoogleAuth } from "google-auth-library";

const SCOPE = "https://www.googleapis.com/auth/calendar.readonly";
const CAL_API = "https://www.googleapis.com/calendar/v3";

async function bearerToken(): Promise<string> {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON not configured.");
  let creds: Record<string, unknown>;
  try {
    creds = JSON.parse(raw);
  } catch {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON.");
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const auth = new GoogleAuth({ credentials: creds as any, scopes: [SCOPE] });
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  if (!token.token) throw new Error("Failed to obtain Calendar access token.");
  return token.token;
}

export interface CalendarEvent {
  id: string;
  summary: string;
  description?: string | null;
  location?: string | null;
  start: string;
  end: string;
  attendees: string[];
  htmlLink?: string | null;
  allDay: boolean;
}

export interface ListEventsOptions {
  calendarId?: string;
  timeMin?: string;
  timeMax?: string;
  maxResults?: number;
  q?: string;
}

interface RawEvent {
  id?: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  attendees?: Array<{ email?: string }>;
  htmlLink?: string;
}

export async function listCalendarEvents(opts: ListEventsOptions = {}): Promise<CalendarEvent[]> {
  const calendarId = opts.calendarId ?? process.env.GOOGLE_CALENDAR_ID;
  if (!calendarId) {
    throw new Error("No calendar specified. Pass calendarId or set GOOGLE_CALENDAR_ID in Vercel env.");
  }
  const token = await bearerToken();

  const params = new URLSearchParams();
  params.set("timeMin", opts.timeMin ?? new Date().toISOString());
  if (opts.timeMax) params.set("timeMax", opts.timeMax);
  params.set("maxResults", String(Math.min(opts.maxResults ?? 25, 250)));
  params.set("singleEvents", "true");
  params.set("orderBy", "startTime");
  if (opts.q) params.set("q", opts.q);

  const res = await fetch(
    `${CAL_API}/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) {
    throw new Error(`Calendar events.list → ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as { items?: RawEvent[] };

  return (data.items ?? []).map((e) => {
    const startDt = e.start?.dateTime ?? e.start?.date ?? "";
    const endDt = e.end?.dateTime ?? e.end?.date ?? "";
    return {
      id: e.id ?? "",
      summary: e.summary ?? "(no title)",
      description: e.description ?? null,
      location: e.location ?? null,
      start: startDt,
      end: endDt,
      attendees: (e.attendees ?? []).map((a) => a.email ?? "").filter(Boolean),
      htmlLink: e.htmlLink ?? null,
      allDay: !e.start?.dateTime,
    };
  });
}
