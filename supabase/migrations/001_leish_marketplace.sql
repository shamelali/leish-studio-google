-- Leish! marketplace core schema on Postgres (Supabase).
-- Document-per-row design mirroring the Firestore adapter: each entity is
-- stored whole in a jsonb `data` column, with scalar lookup columns for the
-- queries the app performs (by id, by salon, by normalized email).
-- Idempotent: safe to re-run (CREATE IF NOT EXISTS, DROP POLICY IF EXISTS).
-- The server uses the service_role key, which bypasses RLS. RLS is still
-- enabled with no permissive policies so anon/authenticated client keys
-- cannot read or write anything directly (deny by default).

-- Salons: full Salon object per row (services, staff, gallery nested).
CREATE TABLE IF NOT EXISTS salons (
  id   text PRIMARY KEY,
  data jsonb NOT NULL
);

-- Bookings: lookup by salon and by client email (case-insensitive).
CREATE TABLE IF NOT EXISTS bookings (
  id           text PRIMARY KEY,
  salon_id     text NOT NULL,
  client_email text NOT NULL,
  data         jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS bookings_by_salon ON bookings (salon_id);
CREATE INDEX IF NOT EXISTS bookings_by_client_email ON bookings (lower(client_email));

-- Reviews: lookup by salon; per-salon ordering by date happens in code.
CREATE TABLE IF NOT EXISTS reviews (
  id       text PRIMARY KEY,
  salon_id text NOT NULL,
  data     jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS reviews_by_salon ON reviews (salon_id);

-- Users: email unique case-insensitively (mirrors the Firestore
-- userEmails claim + emailMatch guards).
CREATE TABLE IF NOT EXISTS users (
  id    text PRIMARY KEY,
  email text NOT NULL,
  data  jsonb NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users (lower(email));

-- Email ownership claims: sha256(normalized email) -> user id.
-- Guards concurrent duplicate registrations the way Firestore
-- transactions do (unique PK rejects the loser).
CREATE TABLE IF NOT EXISTS user_emails (
  email_key text PRIMARY KEY,
  user_id   text NOT NULL REFERENCES users (id) ON DELETE CASCADE
);

-- Review claims: sha256(reviewerId:bookingId) -> review row.
-- Enforces one review per reviewer per booking.
CREATE TABLE IF NOT EXISTS review_claims (
  claim_key text PRIMARY KEY,
  reviewer_id text NOT NULL,
  booking_id  text NOT NULL,
  review_id   text NOT NULL REFERENCES reviews (id) ON DELETE CASCADE,
  salon_id    text NOT NULL
);

-- Deny-by-default RLS on every table (no permissive policies created).
-- Server access uses the service_role key and bypasses RLS.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['salons', 'bookings', 'reviews', 'users', 'user_emails', 'review_claims']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END
$$;
