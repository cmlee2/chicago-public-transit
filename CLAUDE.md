# Chicago Public Transit Tracker

Real-time CTA bus and train arrival tracker with user favorites. Metra support planned for later.

## Tech Stack

- **Monorepo**: Turborepo + pnpm workspaces (pnpm 9.15.0)
- **Frontend**: Next.js 15 (App Router, Turbopack) + Tailwind CSS v4 + shadcn/ui v4
- **Auth**: Clerk (`@clerk/nextjs`)
- **Database**: Supabase (Postgres + Realtime) — project ref `fggetgevustlczhlqtbc`
- **Worker**: Node.js service with `node-cron`, deployed on Railway
- **Language**: TypeScript throughout

## Monorepo Layout

```
apps/web/          → Next.js frontend (port 3000)
apps/worker/       → Background polling worker (Railway)
packages/shared/   → Shared types (@cpt/shared) and constants (CTA API types, train line colors)
packages/supabase/ → SQL migrations and seed data
```

## Running Locally

```bash
pnpm dev          # starts both web and worker via Turborepo
pnpm build        # builds all packages (web needs env vars set)
```

- Web env: `apps/web/.env.local` (Supabase public keys, Clerk keys)
- Worker env: `apps/worker/.env.local` (CTA API keys, Supabase service role)

## Database Schema (Supabase)

Tables in `packages/supabase/migrations/00001_initial_schema.sql`:

- **routes** — route_id (PK), name, color, type (bus/train)
- **stops** — stop_id (PK), name, lat, lng, type, route_id (FK → routes)
- **arrivals** — id (PK), stop_id (FK → stops), route, direction, eta, vehicle_id, is_delayed, updated_at. **Realtime enabled**.
- **user_favorites** — (user_id, stop_id) composite PK. user_id comes from Clerk JWT `sub` claim.

RLS: routes/stops/arrivals are publicly readable. user_favorites scoped to `auth.jwt() ->> 'sub'`. Worker writes use service role key (bypasses RLS).

Migration has NOT been applied yet — run via Supabase MCP `apply_migration` or dashboard.

## Data Flow

1. Worker polls CTA Bus/Train APIs every 30s for stops that have user favorites
2. Worker upserts arrival predictions into `arrivals` table
3. Frontend subscribes to `arrivals` changes via Supabase Realtime (filtered by stop_id)
4. UI updates live as new ETAs arrive

## Frontend Routes

- `/` — Stop search (queries `stops` table by name)
- `/stops/[id]` — Stop detail with real-time arrivals + favorite toggle
- `/favorites` — User's favorited stops with next arrival (protected, requires auth)
- `/sign-in`, `/sign-up` — Clerk auth pages

Middleware in `src/middleware.ts` protects `/favorites` route.
Layout uses `force-dynamic` to avoid static prerendering (Clerk needs runtime keys).

## Worker Details (`apps/worker/src/`)

- `index.ts` — Entry point. Schedules polling (30s), route caching (1hr), notifications (1min), stale cleanup (5min). Only polls stops that have user favorites.
- `cta-bus.ts` — Polls CTA Bus Tracker API. Chunks stop IDs in batches of 10.
- `cta-train.ts` — Polls CTA Train Tracker API. One station per request.
- `notify.ts` — Checks for arrivals within 5 min of favorited stops (logs only, no push service yet).
- `supabase.ts` — Supabase client using service role key.
- `Dockerfile` — Multi-stage build for Railway deployment.

## CTA API Details

- Bus API base: `http://www.ctabustracker.com/bustime/api/v2`
- Train API base: `http://lapi.transitchicago.com/api/1.0`
- Bus timestamps: `YYYYMMDD HH:mm` format
- Train timestamps: `YYYY-MM-DDTHH:mm:ss` format
- Shared types for API responses are in `packages/shared/src/types.ts`

## Known TODOs

- Apply Supabase migration (schema not yet in DB)
- Seed stops data (only train routes seeded so far, no actual stop records)
- Worker env uses `SUPABASE_URL` or falls back to `NEXT_PUBLIC_SUPABASE_URL` — needs `SUPABASE_SERVICE_ROLE_KEY` (not publishable key) for writes
- Notification system is log-only — no push notification service integrated yet
- Metra support not yet started
- No map view yet (stop search is text-based)
