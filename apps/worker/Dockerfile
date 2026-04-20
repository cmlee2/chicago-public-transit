FROM node:22-slim AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

# Copy workspace config
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./

# Copy all workspace package.json files
COPY apps/worker/package.json apps/worker/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY packages/supabase/package.json packages/supabase/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source
COPY packages/shared/src/ packages/shared/src/
COPY packages/shared/tsconfig.json packages/shared/tsconfig.json
COPY apps/worker/src/ apps/worker/src/
COPY apps/worker/tsconfig.json apps/worker/tsconfig.json

# Build worker (esbuild bundles @cpt/shared inline, no symlink needed)
RUN pnpm --filter @cpt/worker build

WORKDIR /app/apps/worker
CMD ["node", "dist/index.js"]
