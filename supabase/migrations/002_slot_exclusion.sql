-- Leish! DB-level slot-conflict enforcement (Tier-2 hardening).
-- The consolidated 001 keeps scalar slot columns as TEXT (ISO instants with
-- '' defaults), so the exclusion constraint casts them on the fly; NULL or
-- empty ranges never conflict, matching server/slots.ts semantics.
-- Idempotent: safe to re-run. Requires the btree_gist extension.
-- Apply AFTER 001 (the app's 23P01 → 409 slot_conflict mapping activates
-- automatically once this constraint exists).

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE leish_bookings DROP CONSTRAINT IF EXISTS leish_bookings_no_double_booking;
ALTER TABLE leish_bookings ADD CONSTRAINT leish_bookings_no_double_booking
  EXCLUDE USING gist (
    salon_id WITH =,
    staff_id WITH =,
    tstzrange(NULLIF(starts_at, '')::timestamptz, NULLIF(ends_at, '')::timestamptz) WITH &&
  ) WHERE (status IS NOT NULL AND status <> 'cancelled' AND starts_at <> '' AND ends_at <> '');
