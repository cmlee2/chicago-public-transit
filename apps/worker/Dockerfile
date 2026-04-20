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

# Build shared
RUN cd /app/packages/shared && npx tsc

# Build worker
RUN cd /app/apps/worker && npx tsc

# Ensure shared dist is directly accessible (bypass pnpm symlink issues)
RUN mkdir -p /app/apps/worker/node_modules/@cpt/shared/dist && \
    cp -r /app/packages/shared/dist/* /app/apps/worker/node_modules/@cpt/shared/dist/ && \
    cp /app/packages/shared/package.json /app/apps/worker/node_modules/@cpt/shared/package.json

WORKDIR /app/apps/worker
CMD ["node", "dist/index.js"]
