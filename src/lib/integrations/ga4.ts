import { GoogleAuth } from "google-auth-library";
import { db } from "@/lib/prisma";

const SCOPE = "https://www.googleapis.com/auth/analytics.readonly";
const GA4_API = "https://analyticsdata.googleapis.com/v1beta";

async function bearerToken(): Promise<string> {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON not configured in Vercel env.");
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
  if (!token.token) throw new Error("Failed to obtain GA4 access token.");
  return token.token;
}

export interface GA4SnapshotOptions {
  propertyId?: string;
  startDate?: string;
  endDate?: string;
  persist?: boolean;
}

interface RunReportResponse {
  rows?: Array<{
    dimensionValues?: Array<{ value?: string }>;
    metricValues?: Array<{ value?: string }>;
  }>;
}

export async function ga4Snapshot(opts: GA4SnapshotOptions = {}) {
  const propertyId = opts.propertyId ?? process.env.GA4_PROPERTY_ID;
  if (!propertyId) {
    throw new Error("GA4_PROPERTY_ID not configured. Pass propertyId or set the env var.");
  }
  const token = await bearerToken();

  const res = await fetch(`${GA4_API}/properties/${propertyId}:runReport`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      dateRanges: [{ startDate: opts.startDate ?? "28daysAgo", endDate: opts.endDate ?? "today" }],
      dimensions: [{ name: "date" }],
      metrics: [
        { name: "sessions" },
        { name: "totalUsers" },
        { name: "screenPageViews" },
        { name: "conversions" },
        { name: "totalRevenue" },
      ],
    }),
  });
  if (!res.ok) {
    throw new Error(`GA4 runReport → ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as RunReportResponse;

  const rows = (data.rows ?? []).map((r) => {
    const v = r.metricValues ?? [];
    return {
      date: r.dimensionValues?.[0]?.value ?? "",
      sessions: Number(v[0]?.value ?? 0),
      totalUsers: Number(v[1]?.value ?? 0),
      pageViews: Number(v[2]?.value ?? 0),
      conversions: Number(v[3]?.value ?? 0),
      totalRevenue: Number(v[4]?.value ?? 0),
    };
  });

  const totals = rows.reduce(
    (acc, r) => ({
      sessions: acc.sessions + r.sessions,
      totalUsers: acc.totalUsers + r.totalUsers,
      pageViews: acc.pageViews + r.pageViews,
      conversions: acc.conversions + r.conversions,
      totalRevenue: acc.totalRevenue + r.totalRevenue,
    }),
    { sessions: 0, totalUsers: 0, pageViews: 0, conversions: 0, totalRevenue: 0 }
  );

  let snapshotId: string | null = null;
  if (opts.persist) {
    const snap = await db.analyticsSnapshot.create({
      data: {
        platform: "ga4",
        metrics: JSON.stringify({ propertyId, totals, byDate: rows }),
        source: "api",
      },
    });
    snapshotId = snap.id;
  }

  return {
    propertyId,
    dateRange: { start: opts.startDate ?? "28daysAgo", end: opts.endDate ?? "today" },
    totals,
    rows,
    snapshotId,
  };
}
