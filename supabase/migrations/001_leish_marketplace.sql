-- Leish! marketplace tables on Supabase (prefixed to coexist with the
-- project's existing schema). Document-per-row design: each entity is stored
-- whole in a jsonb `data` column, with scalar lookup columns for queries.
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS leish_salons (
  id   text PRIMARY KEY,
  data jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS leish_bookings (
  id           text PRIMARY KEY,
  salon_id     text NOT NULL,
  client_email text NOT NULL,
  data         jsonb NOT NULL
);
-- Backfill scalar columns on pre-existing leish_bookings rows (idempotent).
ALTER TABLE leish_bookings ADD COLUMN IF NOT EXISTS created_at text NOT NULL DEFAULT '';
ALTER TABLE leish_bookings ADD COLUMN IF NOT EXISTS staff_id text NOT NULL DEFAULT '';
ALTER TABLE leish_bookings ADD COLUMN IF NOT EXISTS booking_date text NOT NULL DEFAULT '';
ALTER TABLE leish_bookings ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT '';
ALTER TABLE leish_bookings ADD COLUMN IF NOT EXISTS starts_at text NOT NULL DEFAULT '';
ALTER TABLE leish_bookings ADD COLUMN IF NOT EXISTS ends_at text NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS leish_bookings_by_salon ON leish_bookings (salon_id);
CREATE INDEX IF NOT EXISTS leish_bookings_by_client_email ON leish_bookings (lower(client_email));
CREATE INDEX IF NOT EXISTS leish_bookings_by_created_at ON leish_bookings (created_at);

CREATE TABLE IF NOT EXISTS leish_reviews (
  id       text PRIMARY KEY,
  salon_id text NOT NULL,
  data     jsonb NOT NULL
);
-- Backfill scalar columns on pre-existing leish_reviews rows (idempotent).
ALTER TABLE leish_reviews ADD COLUMN IF NOT EXISTS date text NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS leish_reviews_by_salon ON leish_reviews (salon_id);
CREATE INDEX IF NOT EXISTS leish_reviews_by_date ON leish_reviews (date);

-- App user profiles (keyed by Supabase Auth id). The existing `profiles`
-- table belongs to the previous build's schema; this one is ours.
CREATE TABLE IF NOT EXISTS leish_users (
  id    text PRIMARY KEY,
  email text NOT NULL,
  data  jsonb NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS leish_users_email_unique ON leish_users (lower(email));

-- Email ownership claims: sha256(normalized email) -> user id.
CREATE TABLE IF NOT EXISTS leish_user_emails (
  email_key text PRIMARY KEY,
  user_id   text NOT NULL
);

-- Review claims: sha256(reviewerId:bookingId) -> review row.
CREATE TABLE IF NOT EXISTS leish_review_claims (
  claim_key  text PRIMARY KEY,
  reviewer_id text NOT NULL,
  booking_id  text NOT NULL,
  review_id   text NOT NULL,
  salon_id    text NOT NULL
);

-- Idempotency keys for idempotent booking creation (FR-005).
CREATE TABLE IF NOT EXISTS leish_idempotency_keys (
  idem_key   text PRIMARY KEY,
  booking_id text NOT NULL,
  expires_at timestamptz NOT NULL
);

-- Guest email OTP records (FR-001), keyed by normalized contact.
CREATE TABLE IF NOT EXISTS leish_contact_verifications (
  contact_key text PRIMARY KEY,
  code_hash   text NOT NULL,
  attempts    integer NOT NULL DEFAULT 0,
  expires_at  timestamptz NOT NULL
);

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['leish_salons', 'leish_bookings', 'leish_reviews', 'leish_users', 'leish_user_emails', 'leish_review_claims', 'leish_idempotency_keys', 'leish_contact_verifications']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END
$$;
