# Deploying Axis to Vercel + Neon

End-to-end walkthrough. ~15 minutes from zero to a live Axis backend reachable
from `atlystudios.ai`.

## 1. Provision Postgres on Neon

1. Sign up at [neon.tech](https://neon.tech), create a project named `atly-axis`.
2. From the dashboard, open **Connection Details**.
3. Copy the **pooled** connection string — this is `DATABASE_URL`. It includes
   `pgbouncer=true` in the query string.
4. Toggle to the **direct** (unpooled) connection string — this is `DIRECT_URL`.
   Prisma migrations need it because pgbouncer + Prisma's prepared statements
   don't get along.
5. Both URLs look like:
   ```
   postgresql://USER:PASS@ep-xxx.neon.tech/atly_axis?sslmode=require...
   ```

## 2. Push this repo to GitHub

```bash
# already done on this branch:
git push -u origin claude/build-atly-axis-3kDQF
```

When you're ready for production, merge into `main`. Vercel will track whichever
branch you point it at.

## 3. Create a Vercel project

1. [vercel.com/new](https://vercel.com/new), import the
   `Tristian-AS/ATLY-AXIS-Intelligence-Layer` repo.
2. Framework: **Next.js** (auto-detected).
3. Root directory: leave at the repo root.
4. Build command: leave default (`npm run build` — runs Prisma migrate deploy +
   Next build).
5. **Don't deploy yet** — set env vars first.

## 4. Set environment variables

In the Vercel project's **Settings → Environment Variables**, add — for the
**Production** environment, then **Preview** and **Development** if you want:

| Key | Value |
|---|---|
| `DATABASE_URL` | Neon pooled URL from step 1 |
| `DIRECT_URL` | Neon direct URL from step 1 |
| `ANTHROPIC_API_KEY` | Your Claude key (`sk-ant-...`) |
| `AXIS_API_TOKEN` | `openssl rand -hex 32` output — keep it secret |
| `AXIS_PUBLIC_URL` | `https://axis.atlystudios.ai` (or the `*.vercel.app` URL) |
| `AXIS_ALLOWED_ORIGINS` | `https://atlystudios.ai,https://www.atlystudios.ai` |
| `AXIS_MODEL` | `claude-opus-4-7` (optional override) |
| `AXIS_FAST_MODEL` | `claude-sonnet-4-6` (optional override) |

## 5. Deploy + verify

1. Click **Deploy**. First build runs `prisma generate && prisma migrate deploy &&
   next build`. The `migrate deploy` step applies the committed migration in
   `prisma/migrations/20260519000000_init/` to your Neon DB.
2. When the deployment is green, hit the health endpoint:
   ```bash
   curl https://<your-vercel-url>/api/health
   # {"ok":true,"dbOk":true,"anthropicConfigured":true,"tokenConfigured":true,...}
   ```
3. Test the auth wall:
   ```bash
   curl -i https://<your-vercel-url>/api/axis/clients
   # 401 unauthorized
   ```
4. Test an authed call:
   ```bash
   curl -H "Authorization: Bearer $AXIS_API_TOKEN" \
        https://<your-vercel-url>/api/axis/status
   # {"status":{...},"taxes":{...}}
   ```
5. Test chat:
   ```bash
   curl -N -H "Authorization: Bearer $AXIS_API_TOKEN" \
        -H "Content-Type: application/json" \
        -d '{"message":"Create a client called Loftwood, industry: architecture"}' \
        https://<your-vercel-url>/api/axis/chat
   # SSE stream of deltas + tool events, ending with "event: done"
   ```

## 6. Custom domain (optional)

Point `axis.atlystudios.ai` at Vercel:
- Vercel → Project → Settings → Domains → add `axis.atlystudios.ai`.
- Add the Vercel-provided CNAME record in your DNS.
- Update `AXIS_PUBLIC_URL` to `https://axis.atlystudios.ai`, redeploy.

## 7. Seed (optional)

Once Vercel is live and Neon is happy, seed locally against the same DB if you
want Rhøme and the initial state:

```bash
# locally
cp .env.example .env
# paste your Neon URLs and ANTHROPIC_API_KEY into .env
npm install
npx prisma migrate deploy
npm run db:seed
```

## Notes on serverless + SQLite

This project used SQLite in v0.1. Vercel's serverless functions don't keep a
disk between invocations, so SQLite isn't viable there. Postgres on Neon is
the right substrate — and Neon's free tier (3 GB storage, autoscale-to-zero
compute) is plenty for Axis's first year.

## Wiki + raw memory on serverless

`wiki/` is committed to git and gets bundled into the deployment. Writes from
the running app (e.g. `updateStatusPage` rewriting `wiki/_status.md`) **don't
persist** across deployments on Vercel — the filesystem is read-only at
runtime.

For now this is acceptable: the wiki is regenerated on demand from DB state.
Once you want durable wiki edits from the chat, the right move is to store the
wiki in S3/R2 or as Markdown rows in Postgres. **Not in this build round.**
