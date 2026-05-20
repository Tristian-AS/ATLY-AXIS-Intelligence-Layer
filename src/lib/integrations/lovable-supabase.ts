/**
 * Lovable Supabase live-read integration.
 *
 * The ATLY Axis Lovable UI persists clients/projects/events/etc. into its own
 * Supabase Postgres. Axis (Vercel + Neon) is a separate database. This module
 * gives Axis a read-only view into Lovable's tables so the chatbot, dashboards,
 * and dailyBrief can answer questions about whatever Tristian sees in the
 * Lovable cockpit.
 *
 * Setup: paste Lovable's Postgres connection URI into Vercel env as
 *   LOVABLE_SUPABASE_DB_URL=postgresql://postgres.<ref>:<pw>@aws-0-<region>.pooler.supabase.com:6543/postgres
 *
 * Read-only by design — no INSERT/UPDATE/DELETE methods exposed. If we ever
 * need to mutate Lovable data, we add it explicitly with safeguards.
 */

import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";

let _pool: Pool | null = null;

function getPool(): Pool {
  if (_pool) return _pool;
  const url = process.env.LOVABLE_SUPABASE_DB_URL;
  if (!url) {
    throw new Error(
      "LOVABLE_SUPABASE_DB_URL not configured. Paste Lovable's Supabase Postgres URI in Vercel env."
    );
  }
  _pool = new Pool({
    connectionString: url,
    max: 3,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 8_000,
    ssl: { rejectUnauthorized: false },
  });
  return _pool;
}

async function query<T extends QueryResultRow>(sql: string, params: unknown[] = []): Promise<QueryResult<T>> {
  let client: PoolClient | null = null;
  try {
    client = await getPool().connect();
    return await client.query<T>(sql, params);
  } finally {
    client?.release();
  }
}

/** Lists all user tables in the `public` schema with row counts. Use this first
 *  to learn the Lovable schema before writing queries against it. */
export async function lovableInspect(): Promise<{
  tables: Array<{ name: string; rowCount: number; columns: string[] }>;
}> {
  const tablesRes = await query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
     ORDER BY table_name`
  );

  const tables: Array<{ name: string; rowCount: number; columns: string[] }> = [];
  for (const row of tablesRes.rows) {
    const name = row.table_name;
    // Quote with double-quotes; identifier validated by information_schema.
    const countRes = await query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM public."${name.replace(/"/g, '""')}"`
    );
    const colsRes = await query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1
       ORDER BY ordinal_position`,
      [name]
    );
    tables.push({
      name,
      rowCount: parseInt(countRes.rows[0]?.count ?? "0", 10),
      columns: colsRes.rows.map((c) => c.column_name),
    });
  }
  return { tables };
}

/** Read rows from a single Lovable table. Limit capped at 500 for safety. */
export async function lovableReadTable(input: {
  table: string;
  limit?: number;
  orderBy?: string;
  where?: string; // raw WHERE clause body (advanced) — caller's responsibility
}): Promise<{ table: string; rowCount: number; rows: Record<string, unknown>[] }> {
  const limit = Math.min(input.limit ?? 100, 500);
  // Validate the table actually exists to avoid SQL injection via identifier.
  const existsRes = await query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = $1`,
    [input.table]
  );
  if (!existsRes.rows.length) {
    throw new Error(`Lovable: no such table "${input.table}" in public schema.`);
  }
  const escaped = input.table.replace(/"/g, '""');
  // ORDER BY / WHERE are restricted to alphanumeric + simple operators.
  const orderClause = input.orderBy && /^[\w\s,.()=<>'"-]+$/i.test(input.orderBy)
    ? `ORDER BY ${input.orderBy}`
    : "";
  const whereClause = input.where && /^[\w\s,.()=<>'"%-]+$/i.test(input.where)
    ? `WHERE ${input.where}`
    : "";

  const sql = `SELECT * FROM public."${escaped}" ${whereClause} ${orderClause} LIMIT $1`;
  const res = await query<Record<string, unknown>>(sql, [limit]);
  return { table: input.table, rowCount: res.rowCount ?? 0, rows: res.rows };
}

/** Run an arbitrary read-only SELECT against Lovable's Postgres. Hard-guards
 *  against any non-SELECT statement. */
export async function lovableQuery(input: { sql: string; limit?: number }): Promise<{
  rowCount: number;
  rows: Record<string, unknown>[];
}> {
  const trimmed = input.sql.trim().replace(/;+\s*$/g, "");
  if (!/^select\b/i.test(trimmed)) {
    throw new Error("lovableQuery: only SELECT statements are allowed.");
  }
  // Cheap statement-injection guard: reject obvious chained statements.
  if (/;\s*\w/.test(trimmed)) {
    throw new Error("lovableQuery: chained statements are not allowed.");
  }
  // Append a hard LIMIT if the user didn't specify one.
  const limit = Math.min(input.limit ?? 200, 1000);
  const sql = /\blimit\b/i.test(trimmed) ? trimmed : `${trimmed} LIMIT ${limit}`;
  const res = await query<Record<string, unknown>>(sql);
  return { rowCount: res.rowCount ?? 0, rows: res.rows };
}

/** Convenience: try to read what looks like the canonical business tables. */
export async function lovableSnapshot(): Promise<{
  clients?: Record<string, unknown>[];
  projects?: Record<string, unknown>[];
  events?: Record<string, unknown>[];
  invoices?: Record<string, unknown>[];
  errors: Record<string, string>;
}> {
  const result: {
    clients?: Record<string, unknown>[];
    projects?: Record<string, unknown>[];
    events?: Record<string, unknown>[];
    invoices?: Record<string, unknown>[];
    errors: Record<string, string>;
  } = { errors: {} };

  const candidates: Array<{ key: keyof typeof result; tables: string[] }> = [
    { key: "clients", tables: ["clients", "client", "lovable_clients"] },
    { key: "projects", tables: ["projects", "project", "lovable_projects"] },
    { key: "events", tables: ["events", "event", "calendar_events", "upcoming_events"] },
    { key: "invoices", tables: ["invoices", "invoice", "billing_invoices"] },
  ];

  for (const c of candidates) {
    let found = false;
    for (const table of c.tables) {
      try {
        const r = await lovableReadTable({ table, limit: 200 });
        if (c.key !== "errors") {
          (result as Record<string, unknown>)[c.key] = r.rows;
        }
        found = true;
        break;
      } catch {
        /* try next candidate name */
      }
    }
    if (!found) {
      result.errors[c.key] = "no matching table name found";
    }
  }

  return result;
}
