# Wiring atlystudios.ai (Lovable) → Axis

The Lovable variant of `docs/INTEGRATION.md`. Replaces the Next.js BFF with
a Supabase Edge Function. The Edge Function holds the Axis token; the Lovable
frontend never sees it.

```
Lovable frontend (React/Vite, shadcn/ui)
         ↓  fetch / supabase.functions.invoke
Supabase Edge Function · Deno  ← holds AXIS_API_TOKEN as a Supabase secret
         ↓  fetch (token-authenticated)
Axis backend (Vercel)
         ↓
Postgres + raw/wiki memory + Claude Opus
```

## What you'll add to the Lovable project

Three files. All in this Axis repo under `supabase/` and `docs/lovable-snippets/`,
ready to copy across.

| File in this repo | Goes into Lovable repo at |
|---|---|
| `supabase/functions/axis/index.ts` | `supabase/functions/axis/index.ts` |
| `docs/lovable-snippets/use-axis.ts` | `src/lib/axis.ts` |
| `docs/lovable-snippets/AxisChat.tsx` | `src/components/AxisChat.tsx` |

## 1. Deploy the Edge Function

Lovable projects are already paired with a Supabase project. Install the
Supabase CLI if you don't have it, then:

```bash
# from inside the Lovable repo
supabase functions new axis        # creates the folder; replace its index.ts with ours
supabase functions deploy axis
```

Then set the secrets (these never appear in the Lovable code):

```bash
supabase secrets set AXIS_URL=https://axis.atlystudios.ai
supabase secrets set AXIS_API_TOKEN=<same token you set in Vercel>
supabase secrets set AXIS_ALLOWED_ORIGINS=https://atlystudios.ai,https://www.atlystudios.ai,https://<lovable-preview>.lovable.app
```

(Lovable's preview URLs change. Add `*.lovable.app` patterns to your
allowed origins or, simpler, set `AXIS_ALLOWED_ORIGINS=*` for development
and lock it down later.)

## 2. Frontend env

In the Lovable project's env:

```
VITE_SUPABASE_URL=https://<your-project>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key from Supabase dashboard>
```

These are public and safe to ship — the Edge Function gatekeeps the actual
Axis token.

## 3. Drop in `use-axis.ts`

Copy `docs/lovable-snippets/use-axis.ts` to `src/lib/axis.ts` in the Lovable
project. It exports a typed `axis` object covering every endpoint:

```ts
import { axis } from "@/lib/axis";

// In a server component / loader / on mount:
const status = await axis.status();
const { campaigns } = await axis.campaigns.list();
const { client } = await axis.clients.create({ name: "Loftwood" });

// Cinematic Growth Engine — for client-facing pages:
const dashboard = await axis.cinematicEngine.clientDashboard(clientId);
```

## 4. Wire the chat UI

Copy `docs/lovable-snippets/AxisChat.tsx` to `src/components/AxisChat.tsx`,
then render it from any route:

```tsx
import { AxisChat } from "@/components/AxisChat";

export default function StudioBrain() {
  return <AxisChat />;
}
```

Streams tokens as they arrive. Tool calls show as inline badges. No tokens
in the browser — the request hits Supabase, Supabase hits Axis, Axis runs the
Claude tool-use loop, replies stream back through the same chain.

## How auth works end-to-end

1. Lovable user (logged in via Supabase Auth) → browser holds their JWT.
2. `useAxis` sends `Authorization: Bearer <user-jwt>` to the Edge Function.
3. Edge Function verifies the JWT (Supabase does this automatically when
   `verify_jwt = true` in `supabase/config.toml` — the default for new
   functions). It then forwards to Axis with the **Axis token**, not the
   user JWT, plus an `X-Lovable-User-Jwt` header carrying the user identity
   for future per-user audit.
4. Axis records the call as `actor=bff:atlystudios` in its audit log.

## What this does NOT do (call out + stop)

- **Streaming through `supabase.functions.invoke()`.** That API returns a
  parsed body, not a stream. For the chat path, use direct `fetch()` to the
  function URL — exactly what `axis.chatStream` does.
- **Per-Lovable-user actor labels in Axis audit.** Plumbed at the network
  layer (`X-Lovable-User-Jwt` header) but Axis doesn't decode it yet. Easy
  to add when there's more than one operator.

## Test it works

After deploying the Edge Function and setting secrets, from any terminal:

```bash
curl -H "apikey: $SUPABASE_ANON_KEY" \
     -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
     https://<your-project>.supabase.co/functions/v1/axis/api/health
# → {"ok":true,"dbOk":true,...}

curl -H "apikey: $SUPABASE_ANON_KEY" \
     -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
     https://<your-project>.supabase.co/functions/v1/axis/api/axis/status
# → {"status":{...},"taxes":{...}}
```

If that returns 401, the Edge Function isn't holding `AXIS_API_TOKEN`
correctly. Check `supabase secrets list`.

If that returns 502, the Edge Function can't reach Axis. Check `AXIS_URL`
and that the Vercel deployment is live.
