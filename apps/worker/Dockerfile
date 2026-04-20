FROM node:22-slim AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

# Copy workspace config
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./

# Copy all workspace package.json files (pnpm needs them all)
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

# Build shared → produces dist/ with .js files
RUN cd /app/packages/shared && npx tsc && ls dist/

# Build worker → produces dist/ with .js files
RUN cd /app/apps/worker && npx tsc && ls dist/

# Verify the shared dist is reachable from worker's node_modules
RUN ls -la /app/apps/worker/node_modules/@cpt/shared/ && \
    ls /app/apps/worker/node_modules/@cpt/shared/dist/index.js

WORKDIR /app/apps/worker
CMD ["node", "dist/index.js"]
