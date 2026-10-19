# Production Deployment Checklist

## Pre-Deploy (Environment)

- [ ] `STORE_BACKEND=supabase` set in the deployment environment
- [ ] `SUPABASE_URL` set in the deployment environment
- [ ] `SUPABASE_SERVICE_ROLE_KEY` set as a server-only secret
- [ ] `JWT_SECRET` — 64+ character random string (not placeholder)
- [ ] `GEMINI_API_KEY` — valid production key with billing enabled
- [ ] `NODE_ENV=production`
- [ ] `VERCEL=1` (auto-set on Vercel)
- [ ] `LEISH_DISABLE_RATE_LIMIT` NOT set (or = "0")

## Supabase Setup

- [ ] Apply `supabase/migrations/001_leish_marketplace.sql`
- [ ] Apply `supabase/migrations/002_slot_exclusion.sql`
- [ ] Verify the `leish_*` tables and booking exclusion constraint exist
- [ ] Confirm backups and point-in-time recovery are enabled

## Rate Limit Verification

| Endpoint | Limit | Window | Production Tuning |
|----------|-------|--------|-------------------|
| `/api/auth/*` | 20 | 15 min | Increase if >50 signups/min expected |
| `/api/gemini/*` | 15 | 1 min | Increase if AI-heavy traffic |
| `/api/*` (read) | 120 | 1 min | Increase for high-read dashboards |

## Security

- [ ] Secret scanning in CI (GitHub Actions + TruffleHog/Gitleaks)
- [ ] Dependency audit: `npm audit --audit-level=high`
- [ ] CSP headers verified in production (no `unsafe-inline` in scripts)
- [ ] CORS: Verify `Access-Control-Allow-Origin` matches frontend domain
- [ ] Helmet headers present: `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`

## Observability

- [ ] Structured logging (request ID, latency, status) — see `monitoring.ts`
- [ ] Error tracking (Sentry/LogRocket) configured
- [ ] Uptime monitor on `/healthz` (liveness; no store access, limiter-exempt)
- [ ] Alert on: 5xx rate > 1%, 429 rate > 5%, p95 latency > 2s
- [ ] Supabase database usage alerts configured

## Load Testing (Pre-Prod)

- [ ] Run `k6` or `artillery` against staging:
  - 50 concurrent users booking different salons
  - 10 concurrent users booking same salon (contention test)
  - 20 concurrent AI advice requests
- [ ] Verify no 500s, p95 < 500ms for reads, < 2s for writes
- [ ] Verify file locking works (no JSON corruption if fallback enabled)

## Post-Deploy Smoke Tests

```bash
# Health
curl -s https://your-domain.com/healthz | jq '.ok'

# Auth flow
TOKEN=$(curl -s -X POST https://your-domain.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@user.com","password":"pass"}' | jq -r .token)

# Booking (requires valid salon/service/staff IDs from /api/salons)
curl -s -X POST https://your-domain.com/api/bookings \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"salonId":"salon-1","serviceId":"serv-1-1","staffId":"staff-1-1","date":"2026-12-25","time":"10:00 AM","clientName":"Test","clientEmail":"test@user.com","clientPhone":"555-0000"}'

# AI Advice
curl -s -X POST https://your-domain.com/api/gemini/advice \
  -H "Content-Type: application/json" \
  -d '{"goals":"bridal glow","skinHairType":"oily, warm undertone","occasion":"wedding"}'
```

## Rollback Plan

- [ ] Previous commit SHA recorded: `0b89be6`
- [ ] Vercel rollback: `vercel rollback [deployment-url]`
- [ ] Supabase: point-in-time recovery and a tested restore procedure

---

## Emergency Contacts

| Role | Contact |
|------|---------|
| Backend Lead | @shamelali |
| Firebase Admin | Firebase Console > Project Settings |
| Vercel Support | Vercel Dashboard > Help |

---

*Generated from five-axis code review of commit 0b89be6. Last updated: 2026-10-15*
