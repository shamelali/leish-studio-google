-- Leish! DB-level slot-conflict enforcement (Tier-2 hardening).
-- The consolidated 001 keeps scalar slot columns as TEXT (ISO instants with
-- '' defaults), so a text-to-timestamptz cast cannot be used inside an
-- EXCLUDE constraint (casts are not IMMUTABLE). A constraint trigger provides
-- the same DB-level race protection and raises SQLSTATE 23P01, which the
-- app's existing handler maps to SlotConflictError.
-- Idempotent: safe to re-run. Requires the btree_gist extension.
-- Apply AFTER 001 (the app's 23P01 → 409 slot_conflict mapping activates
-- automatically once this constraint exists).

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE leish_bookings DROP CONSTRAINT IF EXISTS leish_bookings_no_double_booking;

-- Constraint trigger: rejects overlapping active bookings for the same
-- salon+staff+time window. Raises 23P01 so server/supabase-store.ts maps it
-- to SlotConflictError (23P01 handler already present).
CREATE OR REPLACE FUNCTION leish_check_booking_overlap() RETURNS TRIGGER AS $$
DECLARE
    n int;
BEGIN
    -- Skip cancelled bookings or those without slot times.
    IF NEW.status = 'cancelled' OR NEW.starts_at = '' OR NEW.ends_at = '' THEN
        RETURN NEW;
    END IF;

    SELECT COUNT(*) INTO n
    FROM leish_bookings
    WHERE salon_id = NEW.salon_id
      AND staff_id = NEW.staff_id
      AND id <> NEW.id
      AND status <> 'cancelled'
      AND starts_at <> '' AND ends_at <> ''
      AND NEW.starts_at::timestamptz < ends_at::timestamptz
      AND starts_at::timestamptz < NEW.ends_at::timestamptz;

    IF n > 0 THEN
        RAISE EXCEPTION 'Slot conflict' USING ERRCODE = '23P01';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS leish_booking_overlap_trigger ON leish_bookings;
CREATE CONSTRAINT TRIGGER leish_booking_overlap_trigger
    AFTER INSERT OR UPDATE ON leish_bookings
    FOR EACH ROW
    EXECUTE FUNCTION leish_check_booking_overlap();
