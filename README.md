# Leish! Aesthetic Marketplace

Full-stack Vite + React + Express application for discovering salons, booking
beauty services, and using the AI styling studios.

## Requirements

- Node.js `22.23.3` (see `.node-version`)
- pnpm `12.9.1`
- Docker (optional, for a production-like build)

## Setup

```bash
corepack enable
corepack prepare pnpm@12.9.1 --activate
pnpm install --frozen-lockfile
cp .env.example .env.local
```

Use the local JSON store for development and tests. Add real credentials to
`.env.local` only; never commit it.

## Run locally

```bash
pnpm run dev
```

The app is served on `http://localhost:3000` unless `PORT` is set.

## Checks

```bash
pnpm run typecheck
pnpm test
pnpm run lint
pnpm run build
```

The single full verification command is:

```bash
pnpm run verify
```

The Supabase integration tests are skipped unless both
`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are configured.

## Supabase production setup

1. Create a Supabase project.
2. Apply `supabase/migrations/001_leish_marketplace.sql` and
   `supabase/migrations/002_slot_exclusion.sql` in order.
3. Configure `STORE_BACKEND=supabase`, `SUPABASE_URL`, and
   `SUPABASE_SERVICE_ROLE_KEY` in the deployment secret manager.
4. Configure the optional Auth variables listed in `.env.example` when browser
   OAuth is enabled.

The service-role key is server-only and must never use a `VITE_` prefix.

## Docker

```bash
docker build -t leish-studio .
docker run --rm -p 3000:3000 --env-file .env.local leish-studio
```

## Deployment

The repository includes `render.yaml` for Render deployment. Render runs the
locked dependency install, `pnpm run build`, and `pnpm exec tsx dev.ts`.
Set production secrets in Render's environment settings and use the Supabase
backend for durable data. See `docs/07-launch-runbook.md` and
`PRODUCTION_CHECKLIST.md` for smoke tests and rollback guidance.
