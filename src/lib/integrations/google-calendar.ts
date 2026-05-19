import { google } from "googleapis";

function googleAuth(scopes: string[]) {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON not configured.");
  let creds: Record<string, unknown>;
  try {
    creds = JSON.parse(raw);
  } catch {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON.");
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new google.auth.GoogleAuth({ credentials: creds as any, scopes });
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
  calendarId?: string; // default: GOOGLE_CALENDAR_ID env, else "primary" (won't work for service account)
  timeMin?: string;
  timeMax?: string;
  maxResults?: number;
  q?: string;
}

/**
 * Lists upcoming calendar events from a calendar shared with the
 * service account. Requires the calendar's *settings → share with specific
 * people* to include the service-account email
 * (e.g. atly-studios-sandbox@integration-474408.iam.gserviceaccount.com)
 * with at least "See all event details" access.
 */
export async function listCalendarEvents(opts: ListEventsOptions = {}): Promise<CalendarEvent[]> {
  const calendarId = opts.calendarId ?? process.env.GOOGLE_CALENDAR_ID;
  if (!calendarId) {
    throw new Error(
      "No calendar specified. Pass calendarId, or set GOOGLE_CALENDAR_ID in Vercel env."
    );
  }
  const auth = googleAuth(["https://www.googleapis.com/auth/calendar.readonly"]);
  const calendar = google.calendar({ version: "v3", auth });

  const res = await calendar.events.list({
    calendarId,
    timeMin: opts.timeMin ?? new Date().toISOString(),
    timeMax: opts.timeMax,
    maxResults: Math.min(opts.maxResults ?? 25, 250),
    singleEvents: true,
    orderBy: "startTime",
    q: opts.q,
  });

  return (res.data.items ?? []).map((e) => {
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
