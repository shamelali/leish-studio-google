# Leish! Launch Runbook

This runbook covers the repository's checked-in Render + Express deployment
profile. Supabase is the production data backend for that profile; JSON remains
available for local development and tests, while Firestore remains an optional
adapter verified through the emulator suite. Payments, real availability, and
consent-backed analytics remain separate work.

## 1. Preflight

Run from `leish-studio-google-v2` with Node.js 22.x and pnpm 12.9.1:

```bash
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm test
pnpm run build
pnpm exec playwright test --list
```

For the default browser smoke run, Playwright starts `pnpm run dev` against an
isolated copy of `server/test-fixture.json` and clears external credential
variables. No production secrets are needed:

```bash
pnpm run test:e2e
```

Set `PLAYWRIGHT_BASE_URL` when the browser checks should use an existing
deployment instead of the local server. The valid-email OTP test remains
skipped unless `PLAYWRIGHT_EXTERNAL_SERVICES=1` is set and the target has a
working Brevo transport; the invalid and empty-contact checks are always
keyless.

Confirm the working tree contains no `.env.local`, generated credentials, or
unexpected `api/[...path].js` changes before pushing.

## 2. Deployment environment checklist

Configure these in the Render service settings, not in source control:

| Variable | Required | Notes |
|---|---:|---|
| `JWT_SECRET` | Yes in production | Random secret of at least 32 bytes. Rotate deliberately; changing it invalidates active sessions. |
| `STORE_BACKEND` | Yes in production | Set explicitly to `supabase`; the JSON backend is local/test only. |
| `SUPABASE_URL` | Yes with Supabase | Project URL for the durable production store. |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes with Supabase | Server-only service-role secret; never expose it to the browser. |
| `GEMINI_API_KEY` | Only for AI routes | Server-side only; never use a `VITE_` prefix. |
| `APP_URL` | Recommended | Public deployment URL used for self-referential links and callbacks. |
| `VITE_GOOGLE_MAPS_API_KEY` | Only for maps | Restrict the key to the deployed origins and Maps APIs required by the app. |

The server refuses to boot in production unless a durable backend is explicitly
selected; it never silently falls back to an empty or ephemeral JSON catalog.
If a separate deployment selects Firestore, configure its Firebase Admin
credentials through that deployment's secret manager and run the emulator and
production verification steps before treating it as durable.

## 3. Deploy and smoke test

1. Deploy through the repository's normal Render integration.
2. Open the deployed URL and verify the directory loads.
3. Verify a guest can open a listing, complete the booking steps, and see a
   confirmation receipt.
4. Verify the provider demo journey: sign in, open the provider portal, and
   confirm a pending booking.
5. Check the deep links `/lookbook`, `/ai-stylist`, `/advisor`, `/bookings`,
   `/client`, `/provider`, `/portal/client`, `/portal/provider`,
   `/image-studio`, `/video-studio`, and `/concierge` on a fresh tab. Each
   should return the app shell instead of a 404. `/workspace` is intentionally
   omitted because no Workspace surface exists yet.

Useful read-only checks:

```bash
curl -fsS "$APP_URL/api/salons" >/dev/null
curl -fsS -o /dev/null -w '%{http_code}\n' "$APP_URL/"
```

Never paste tokens, cookies, or response bodies containing personal data into
build logs or issue comments.

## 4. Monitoring

- Use Render service logs for API status codes, timeouts, and startup errors.
- Use the visible `ErrorBoundary` fallback for client-side crashes; capture the
  error and route when reporting an incident, without user-entered content.
- Watch booking and authentication failures first because they are the core
  funnel. A successful page load alone is not a booking smoke test.
- Review the privacy-safe analytics sink only after a consent-backed provider
  has been selected; the default sink intentionally sends nothing.

## 5. Rollback and JWT rotation

### Rollback

1. Stop promotion of the failing deployment.
2. Promote the last known-good Render deployment.
3. Re-run the directory, booking, provider status, and deep-link smoke checks.
4. Preserve the failing deployment URL and Render request/log IDs for diagnosis.

For a source rollback, use a reviewed revert commit and repeat the full
preflight checks before redeploying.

### JWT secret rotation

1. Schedule a short session renewal window and record the current deployment.
2. Generate a new random secret in the deployment secret manager.
3. Update `JWT_SECRET` and redeploy; all existing JWTs will require sign-in
   again by design.
4. Verify sign-in, an authenticated booking read, and a provider status update.
5. Do not store the old or new secret in the repository or runbook.
