FROM node:22-slim AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

# Copy everything needed for the workspace
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/worker/package.json apps/worker/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY packages/supabase/package.json packages/supabase/

# Install all dependencies
RUN pnpm install --frozen-lockfile

# Copy source files
COPY packages/shared/ packages/shared/
COPY apps/worker/ apps/worker/

# Build shared first, then worker
# Use turbo-style sequential build to ensure shared dist/ exists before worker compiles
RUN cd packages/shared && pnpm build && cd /app && cd apps/worker && pnpm build

WORKDIR /app/apps/worker
CMD ["node", "dist/index.js"]
