FROM node:22-alpine

WORKDIR /app

# Enable corepack and install pnpm
RUN corepack enable && corepack prepare pnpm@12.9.1 --activate

# Copy dependency files first for better layer caching
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

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

# Runtime secrets (pass at container start, never baked into image):
#   -e STORE_BACKEND=supabase
#   -e SUPABASE_URL=https://<project>.supabase.co
#   -e SUPABASE_SERVICE_ROLE_KEY=<server-only key>
#   -e JWT_SECRET=<random 64+ char string>
#   -e LEISH_ADMIN_PASSWORD=<bootstrap password for a fresh JSON seed>
#   -e GEMINI_API_KEY=<your Gemini API key>

# Production entry point: serves dist/ static assets + Express API
CMD ["pnpm", "exec", "tsx", "dev.ts"]
