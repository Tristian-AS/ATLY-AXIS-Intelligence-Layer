import { google } from "googleapis";
import { db } from "@/lib/prisma";

/**
 * Returns a Google Auth client backed by GOOGLE_SERVICE_ACCOUNT_JSON.
 * Expects the env var to be the full service-account JSON blob.
 */
function googleAuth(scopes: string[]) {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON not configured in Vercel env.");
  }
  let creds: Record<string, unknown>;
  try {
    creds = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON. Paste the entire service-account .json file contents."
    );
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new google.auth.GoogleAuth({ credentials: creds as any, scopes });
}

export interface GA4SnapshotOptions {
  propertyId?: string; // numeric ID, e.g. "123456789"
  startDate?: string; // YYYY-MM-DD or "7daysAgo"
  endDate?: string; // YYYY-MM-DD or "today"
  persist?: boolean;
}

/**
 * Pulls a default GA4 snapshot: sessions, totalUsers, screenPageViews,
 * conversions, totalRevenue — by date — for a property.
 *
 * Persists to AnalyticsSnapshot when persist=true.
 */
export async function ga4Snapshot(opts: GA4SnapshotOptions = {}) {
  const propertyId = opts.propertyId ?? process.env.GA4_PROPERTY_ID;
  if (!propertyId) {
    throw new Error("GA4_PROPERTY_ID not configured. Pass propertyId or set the env var.");
  }
  const auth = googleAuth(["https://www.googleapis.com/auth/analytics.readonly"]);
  const analyticsdata = google.analyticsdata({ version: "v1beta", auth });

  const res = await analyticsdata.properties.runReport({
    property: `properties/${propertyId}`,
    requestBody: {
      dateRanges: [{ startDate: opts.startDate ?? "28daysAgo", endDate: opts.endDate ?? "today" }],
      dimensions: [{ name: "date" }],
      metrics: [
        { name: "sessions" },
        { name: "totalUsers" },
        { name: "screenPageViews" },
        { name: "conversions" },
        { name: "totalRevenue" },
      ],
    },
  });

  const rows = (res.data.rows ?? []).map((r) => {
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
