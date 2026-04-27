# Chicago Public Transit

Chicago Public Transit is a monorepo for a live Chicago transit tracker covering CTA buses, CTA trains, and Metra.

Live site: https://chicago-public-transit-web.vercel.app/

## What It Does

- Shows a live transit map on the home page.
- Provides stop detail pages with upcoming arrivals.
- Polls CTA and Metra feeds in a background worker.
- Shares types and constants across the web app and worker.

## Monorepo Layout

- `apps/web` - Next.js 15 frontend
- `apps/worker` - polling worker for CTA and Metra data
- `packages/shared` - shared TypeScript types and constants
- `packages/supabase` - SQL migrations and seed files

## Tech Stack

- `pnpm` workspaces
- Turborepo
- Next.js
- React
- Supabase
- Clerk
- Tailwind CSS

## Getting Started

1. Install dependencies:

```bash
pnpm install
```

2. Add environment variables. The app currently expects these names:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
CTA_BUS_API_KEY=
CTA_TRAIN_API_KEY=
METRA_API_TOKEN=
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
```

3. Start the project from the repo root:

```bash
pnpm dev
```

This runs the Turborepo dev tasks for the workspace.

## Useful Commands

```bash
pnpm dev
pnpm build
pnpm lint
```

## Notes

- The live map is the main entry point of the product.
- The checked-in database migration does not fully reflect every current app and worker expectation, so verify schema assumptions before making database changes.
