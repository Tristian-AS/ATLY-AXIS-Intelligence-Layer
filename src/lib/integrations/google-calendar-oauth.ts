import { getAccessToken } from "./google-oauth";

const CAL_API = "https://www.googleapis.com/calendar/v3";

function defaultUserEmail(): string {
  return process.env.AXIS_GMAIL_DEFAULT_USER ?? "tristian@atlystudios.com";
}

async function calFetch<T>(userEmail: string, path: string, init: RequestInit = {}): Promise<T> {
  const token = await getAccessToken(userEmail);
  const res = await fetch(`${CAL_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    throw new Error(`Calendar ${init.method ?? "GET"} ${path} → ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as T;
}

export interface CalendarEventInput {
  summary: string;
  description?: string;
  location?: string;
  /** RFC3339 timestamp e.g. "2026-05-19T16:00:00-07:00" */
  start: string;
  /** RFC3339 timestamp. If omitted, defaults to start + 1h. */
  end?: string;
  /** "America/Los_Angeles" etc. Optional; Google falls back to calendar default. */
  timeZone?: string;
  attendees?: string[];
  /** If true, the event is an all-day event using start as YYYY-MM-DD. */
  allDay?: boolean;
}

export interface CreatedCalendarEvent {
  id: string;
  htmlLink: string;
  summary: string;
  start: string;
  end: string;
  status: string;
  calendarId: string;
}

interface RawCreatedEvent {
  id?: string;
  htmlLink?: string;
  summary?: string;
  status?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
}

/**
 * Creates a calendar event using the connected user's OAuth token.
 * Requires the user to have connected with calendar.events scope.
 * Always returns id + htmlLink so Axis can surface a clickable verification link.
 */
export async function createCalendarEventOAuth(opts: {
  event: CalendarEventInput;
  calendarId?: string;
  userEmail?: string;
  sendUpdates?: "all" | "externalOnly" | "none";
}): Promise<CreatedCalendarEvent> {
  const userEmail = opts.userEmail ?? defaultUserEmail();
  const calendarId = opts.calendarId ?? process.env.GOOGLE_CALENDAR_ID ?? "primary";
  const { event } = opts;

  if (!event.summary) throw new Error("createCalendarEvent: summary is required.");
  if (!event.start) throw new Error("createCalendarEvent: start is required.");

  const body: Record<string, unknown> = {
    summary: event.summary,
    description: event.description,
    location: event.location,
  };

  if (event.allDay) {
    // Google expects YYYY-MM-DD for all-day events
    const startDate = event.start.slice(0, 10);
    const endDate = (event.end ?? event.start).slice(0, 10);
    body.start = { date: startDate };
    body.end = { date: endDate };
  } else {
    const endIso =
      event.end ?? new Date(new Date(event.start).getTime() + 60 * 60 * 1000).toISOString();
    body.start = event.timeZone
      ? { dateTime: event.start, timeZone: event.timeZone }
      : { dateTime: event.start };
    body.end = event.timeZone
      ? { dateTime: endIso, timeZone: event.timeZone }
      : { dateTime: endIso };
  }

  if (event.attendees?.length) {
    body.attendees = event.attendees.map((email) => ({ email }));
  }

  const qs = opts.sendUpdates ? `?sendUpdates=${opts.sendUpdates}` : "";
  const raw = await calFetch<RawCreatedEvent>(
    userEmail,
    `/calendars/${encodeURIComponent(calendarId)}/events${qs}`,
    { method: "POST", body: JSON.stringify(body) }
  );

  if (!raw.id || !raw.htmlLink) {
    throw new Error("Calendar create returned no id/htmlLink — write may have failed silently.");
  }

  return {
    id: raw.id,
    htmlLink: raw.htmlLink,
    summary: raw.summary ?? event.summary,
    start: raw.start?.dateTime ?? raw.start?.date ?? event.start,
    end: raw.end?.dateTime ?? raw.end?.date ?? "",
    status: raw.status ?? "confirmed",
    calendarId,
  };
}

export interface UpdateCalendarEventInput {
  eventId: string;
  calendarId?: string;
  userEmail?: string;
  patch: Partial<CalendarEventInput>;
  sendUpdates?: "all" | "externalOnly" | "none";
}

export async function updateCalendarEventOAuth(input: UpdateCalendarEventInput): Promise<CreatedCalendarEvent> {
  const userEmail = input.userEmail ?? defaultUserEmail();
  const calendarId = input.calendarId ?? process.env.GOOGLE_CALENDAR_ID ?? "primary";

  const body: Record<string, unknown> = {};
  if (input.patch.summary !== undefined) body.summary = input.patch.summary;
  if (input.patch.description !== undefined) body.description = input.patch.description;
  if (input.patch.location !== undefined) body.location = input.patch.location;
  if (input.patch.start) {
    body.start = input.patch.timeZone
      ? { dateTime: input.patch.start, timeZone: input.patch.timeZone }
      : { dateTime: input.patch.start };
  }
  if (input.patch.end) {
    body.end = input.patch.timeZone
      ? { dateTime: input.patch.end, timeZone: input.patch.timeZone }
      : { dateTime: input.patch.end };
  }
  if (input.patch.attendees) {
    body.attendees = input.patch.attendees.map((email) => ({ email }));
  }

  const qs = input.sendUpdates ? `?sendUpdates=${input.sendUpdates}` : "";
  const raw = await calFetch<RawCreatedEvent>(
    userEmail,
    `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(input.eventId)}${qs}`,
    { method: "PATCH", body: JSON.stringify(body) }
  );

  if (!raw.id) throw new Error("Calendar patch returned no id.");
  return {
    id: raw.id,
    htmlLink: raw.htmlLink ?? "",
    summary: raw.summary ?? "",
    start: raw.start?.dateTime ?? raw.start?.date ?? "",
    end: raw.end?.dateTime ?? raw.end?.date ?? "",
    status: raw.status ?? "confirmed",
    calendarId,
  };
}

export async function deleteCalendarEventOAuth(input: {
  eventId: string;
  calendarId?: string;
  userEmail?: string;
  sendUpdates?: "all" | "externalOnly" | "none";
}): Promise<{ ok: true; eventId: string; calendarId: string }> {
  const userEmail = input.userEmail ?? defaultUserEmail();
  const calendarId = input.calendarId ?? process.env.GOOGLE_CALENDAR_ID ?? "primary";
  const token = await getAccessToken(userEmail);
  const qs = input.sendUpdates ? `?sendUpdates=${input.sendUpdates}` : "";
  const res = await fetch(
    `${CAL_API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(input.eventId)}${qs}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok && res.status !== 410) {
    throw new Error(`Calendar delete → ${res.status}: ${await res.text()}`);
  }
  return { ok: true, eventId: input.eventId, calendarId };
}

export interface ListEventsOAuthOptions {
  userEmail?: string;
  calendarId?: string;
  timeMin?: string;
  timeMax?: string;
  maxResults?: number;
  q?: string;
}

export async function listCalendarEventsOAuth(opts: ListEventsOAuthOptions = {}) {
  const userEmail = opts.userEmail ?? defaultUserEmail();
  const calendarId = opts.calendarId ?? process.env.GOOGLE_CALENDAR_ID ?? "primary";
  const params = new URLSearchParams();
  params.set("timeMin", opts.timeMin ?? new Date().toISOString());
  if (opts.timeMax) params.set("timeMax", opts.timeMax);
  params.set("maxResults", String(Math.min(opts.maxResults ?? 25, 250)));
  params.set("singleEvents", "true");
  params.set("orderBy", "startTime");
  if (opts.q) params.set("q", opts.q);

  const data = await calFetch<{
    items?: Array<{
      id?: string;
      summary?: string;
      description?: string;
      location?: string;
      start?: { dateTime?: string; date?: string };
      end?: { dateTime?: string; date?: string };
      attendees?: Array<{ email?: string }>;
      htmlLink?: string;
    }>;
  }>(userEmail, `/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`);

  return (data.items ?? []).map((e) => ({
    id: e.id ?? "",
    summary: e.summary ?? "(no title)",
    description: e.description ?? null,
    location: e.location ?? null,
    start: e.start?.dateTime ?? e.start?.date ?? "",
    end: e.end?.dateTime ?? e.end?.date ?? "",
    attendees: (e.attendees ?? []).map((a) => a.email ?? "").filter(Boolean),
    htmlLink: e.htmlLink ?? null,
    allDay: !e.start?.dateTime,
    calendarId,
  }));
}
