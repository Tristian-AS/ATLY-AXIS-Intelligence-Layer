# ATLY Axis

> The internal operating system for ATLY Studios.
> Chat is the interface. Memory is the brain. The database is the operational layer.
> The Cinematic Growth Engine is the client-facing execution layer.

This repo is **Phase 0 + Phase 1** of the build brief — memory foundation +
chat-controlled database — with the API surface for the Cinematic Growth
Engine stubbed in for Phase 2.

---

## Architecture

```
ATLY Axis Web App   →  src/app/**
       ↓
Native Axis Chat    →  src/app/chat + src/app/api/axis/chat
       ↓
Axis API Layer      →  src/app/api/axis/*  +  src/app/api/cinematic-engine/*
       ↓
AI Runtime + Agents →  src/lib/anthropic.ts + src/lib/tools.ts + src/lib/functions/*
       ↓
Database + Files +  →  prisma/schema.prisma (16 tables)
Memory                  raw/   (evidence)   wiki/  (compiled knowledge)
       ↓
Cinematic Growth    →  /api/cinematic-engine/{campaigns,content-system,client-dashboard}
Engine
```

## Modules

| Route               | What it is                                                |
| ------------------- | --------------------------------------------------------- |
| `/`                 | Live status — what's happening at ATLY right now          |
| `/chat`             | Native Axis chat — the primary interface                  |
| `/clients`          | Roster, brand notes, next actions                         |
| `/projects`         | Active builds, deliverables, risk                         |
| `/campaigns`        | Concepts, hooks, hero direction, goals                    |
| `/content-calendar` | Captions × platforms × dates × approvals                  |
| `/finance`          | Invoices, expenses, subs, taxes, profitability            |
| `/memory`           | Browse the wiki and recent memory notes                   |

## The nine core backend functions (§13)

| Function                  | File                                              |
| ------------------------- | ------------------------------------------------- |
| `createClient`            | `src/lib/functions/createClient.ts`               |
| `createProject`           | `src/lib/functions/createProject.ts`              |
| `createInvoice`           | `src/lib/functions/createInvoice.ts`              |
| `createCampaign`          | `src/lib/functions/createCampaign.ts`             |
| `generateCampaignPlan`    | `src/lib/functions/generateCampaignPlan.ts`       |
| `generateContentCalendar` | `src/lib/functions/generateContentCalendar.ts`    |
| `updateMemory`            | `src/lib/functions/updateMemory.ts`               |
| `updateStatusPage`        | `src/lib/functions/updateStatusPage.ts`           |
| `estimateTaxes`           | `src/lib/functions/estimateTaxes.ts`              |

All nine are exposed to Claude via tool-use in `src/lib/tools.ts`, plus
helpers for logging payments / expenses / tasks and browsing the wiki.

## The memory architecture (§5)

```
raw/                       # original evidence, gitignored bulk
├── client-assets/
├── proposals/
├── invoices/
├── expenses/
├── analytics/
├── shoot-notes/
├── receipts/
└── misc/

wiki/                      # compiled, structured knowledge
├── index.md
├── _status.md             # rewritten by updateStatusPage()
├── clients/               # one file per client
├── projects/
├── campaigns/
├── finance/
├── analytics/
├── lessons/               # never delete; supersede
├── brand/                 # ATLY canon
└── journal/               # dated notes
```

## Getting it running

### Local

```bash
npm install
cp .env.example .env
# fill in: ANTHROPIC_API_KEY, DATABASE_URL + DIRECT_URL (Neon),
#          AXIS_API_TOKEN (openssl rand -hex 32),
#          AXIS_PUBLIC_URL (http://localhost:3000),
#          AXIS_ALLOWED_ORIGINS (http://localhost:3000)

npx prisma migrate deploy   # apply migrations to Neon
npm run db:seed             # seed Rhøme + initial state
npm run dev                 # http://localhost:3000
```

### Production

See [`docs/DEPLOY.md`](./docs/DEPLOY.md) for the full Vercel + Neon walkthrough.

### Integrating with atlystudios.ai

See [`docs/INTEGRATION.md`](./docs/INTEGRATION.md). The short version: install
`@atly/axis-client` on the atlystudios.ai server, hold `AXIS_API_TOKEN` server-only,
proxy chat as SSE to the browser. The browser never holds a token.

## How Axis thinks

When you tell Axis something, the chat route (`/api/axis/chat`) runs a
tool-use loop with Claude:

1. Claude reads `AXIS_SYSTEM_PROMPT` (operator voice, default-to-remember).
2. Claude decides if your message needs DB writes / memory writes / nothing.
3. Tools execute (`runTool` in `src/lib/tools.ts`).
4. Claude sees the results and either calls more tools or replies.
5. Final reply is persisted to `chat_messages`. Tool calls are persisted too.

Everything that touches a client, project, campaign, invoice, etc. also
updates the corresponding wiki page so the brain stays human-readable.

## Roadmap

- **Phase 0** ✅ Memory foundation (`raw/` + `wiki/`)
- **Phase 1** ✅ Chat-controlled DB, status page, finance views
- **Phase 2** ✅ Postgres + auth + audit + SSE chat + AxisClient SDK (this version)
- **Phase 3** ◐ Cinematic Growth Engine surfaces in atlystudios.ai
- **Phase 4** ◐ Vector memory + Claude Code plugin bridge + background workers

## Stack

- Next.js 15 (App Router) + React 19
- TypeScript end-to-end
- Prisma + **Postgres** (Neon recommended)
- Tailwind (cinematic ink palette)
- Anthropic SDK — Claude Opus 4.7 by default, Sonnet 4.6 as fast model
- Server-sent events for streaming chat
- Bearer-token API auth with same-origin bypass for the native UI
- `@atly/axis-client` typed SDK under `client/`
