-- Leish! DB-level slot-conflict enforcement (Tier-2 hardening).
-- Uses a real EXCLUDE constraint with tstzrange for true concurrent-safety.
-- A generated tstzrange column avoids TEXT→timestamptz cast immutability issues.
-- Idempotent: safe to re-run. Requires the btree_gist extension.
-- Apply AFTER 001 (the app's 23P01 → 409 slot_conflict mapping activates
-- automatically once this constraint exists).

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Drop old trigger-based constraint if present
ALTER TABLE leish_bookings DROP CONSTRAINT IF EXISTS leish_bookings_no_double_booking;
DROP TRIGGER IF EXISTS leish_booking_overlap_trigger ON leish_bookings;
DROP FUNCTION IF EXISTS leish_check_booking_overlap();

-- Add generated tstzrange column for the EXCLUDE constraint
ALTER TABLE leish_bookings
ADD COLUMN IF NOT EXISTS slot_range tstzrange
GENERATED ALWAYS AS (
  CASE
    WHEN starts_at = '' OR ends_at = '' THEN NULL
    ELSE tstzrange(starts_at::timestamptz, ends_at::timestamptz, '[)')
  END
) STORED;

-- Real EXCLUDE constraint: prevents overlapping bookings for same salon+staff
-- Only applies to non-cancelled bookings with valid slot times
ALTER TABLE leish_bookings
ADD CONSTRAINT leish_bookings_no_double_booking
EXCLUDE USING gist (
  salon_id WITH =,
  staff_id WITH =,
  slot_range WITH &&
)
WHERE (status <> 'cancelled' AND slot_range IS NOT NULL);
