FROM node:22-alpine

WORKDIR /app

# Enable corepack and install pnpm
RUN corepack enable && corepack prepare pnpm@12.9.1 --activate

# Copy dependency files first for better layer caching
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./

# Install all dependencies (includes devDependencies needed for build)
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build frontend + server bundle
RUN pnpm run build

# Expose the app port
EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000

# Production entry point: serves dist/ static assets + Express API
CMD ["npx", "tsx", "dev.ts"]
