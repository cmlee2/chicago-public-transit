FROM node:22-slim AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

# Copy root workspace files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./

# Copy ALL workspace package.json files (pnpm needs them all for lockfile resolution)
COPY apps/worker/package.json apps/worker/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY packages/supabase/package.json packages/supabase/

# Install dependencies (only for worker + shared)
RUN pnpm install --frozen-lockfile

# Copy source for shared and worker only
COPY packages/shared/ packages/shared/
COPY apps/worker/ apps/worker/

# Build shared first (produces dist/ with .js + .d.ts), then worker
RUN pnpm --filter @cpt/shared build && pnpm --filter @cpt/worker build

WORKDIR /app/apps/worker
CMD ["node", "dist/index.js"]
