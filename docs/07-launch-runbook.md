# Leish! Launch Runbook

This runbook covers the current Vercel + JSON-store deployment. Firestore,
payments, real availability, and consent-backed analytics are not launch
prerequisites for this development-backed release and remain separate work.

## 1. Preflight

Run from `leish-studio-google-v2` with Node.js 22.x and pnpm 12.9.1:

```bash
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm test
pnpm run build
```

Confirm the working tree contains no `.env.local`, generated credentials, or
unexpected `api/[...path].js` changes before pushing.

## 2. Deployment environment checklist

Configure these in the Vercel project settings, not in source control:

| Variable | Required | Notes |
|---|---:|---|
| `JWT_SECRET` | Yes in production | Random secret of at least 32 bytes. Rotate deliberately; changing it invalidates active sessions. |
| `GEMINI_API_KEY` | Only for AI routes | Server-side only; never use a `VITE_` prefix. |
| `APP_URL` | Recommended | Public deployment URL used for self-referential links and callbacks. |
| `VITE_GOOGLE_MAPS_API_KEY` | Only for maps | Restrict the key to the deployed origins and Maps APIs required by the app. |

The app currently uses the JSON `DataStore` fallback. Do not enable a new
Firestore backend in production until Admin credentials, rules, indexes, and
an emulator round-trip have been verified.

## 3. Deploy and smoke test

1. Deploy through the repository's normal Vercel integration.
2. Open the deployed URL and verify the directory loads.
3. Verify a guest can open a listing, complete the booking steps, and see a
   confirmation receipt.
4. Verify the provider demo journey: sign in, open the provider portal, and
   confirm a pending booking.
5. Check the deep links `/lookbook`, `/ai-stylist`, `/workspace`, `/client`,
   `/provider`, `/image-studio`, `/video-studio`, and `/concierge` on a
   fresh tab. Each should return the app shell instead of a 404.

Useful read-only checks:

```bash
curl -fsS "$APP_URL/api/salons" >/dev/null
curl -fsS -o /dev/null -w '%{http_code}\n' "$APP_URL/"
```

Never paste tokens, cookies, or response bodies containing personal data into
build logs or issue comments.

## 4. Monitoring

- Use Vercel Functions logs for API status codes, timeouts, and startup errors.
- Use the visible `ErrorBoundary` fallback for client-side crashes; capture the
  error and route when reporting an incident, without user-entered content.
- Watch booking and authentication failures first because they are the core
  funnel. A successful page load alone is not a booking smoke test.
- Review the privacy-safe analytics sink only after a consent-backed provider
  has been selected; the default sink intentionally sends nothing.

## 5. Rollback and JWT rotation

### Rollback

1. Stop promotion of the failing deployment.
2. Promote the last known-good Vercel deployment.
3. Re-run the directory, booking, provider status, and deep-link smoke checks.
4. Preserve the failing deployment URL and Vercel request IDs for diagnosis.

For a source rollback, use a reviewed revert commit and repeat the full
preflight checks before redeploying.

### JWT secret rotation

1. Schedule a short session renewal window and record the current deployment.
2. Generate a new random secret in the deployment secret manager.
3. Update `JWT_SECRET` and redeploy; all existing JWTs will require sign-in
   again by design.
4. Verify sign-in, an authenticated booking read, and a provider status update.
5. Do not store the old or new secret in the repository or runbook.
