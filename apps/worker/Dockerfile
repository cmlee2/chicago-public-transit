FROM node:22-slim AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

# Copy root workspace files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./

# Copy package.json files for all workspaces
COPY apps/worker/package.json apps/worker/
COPY packages/shared/package.json packages/shared/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source
COPY packages/shared/ packages/shared/
COPY apps/worker/ apps/worker/

# Build shared package then worker
RUN pnpm --filter @cpt/shared build && pnpm --filter @cpt/worker build

WORKDIR /app/apps/worker
CMD ["node", "dist/index.js"]
