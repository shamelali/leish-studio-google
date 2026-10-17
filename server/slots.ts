/**
 * Slot overlap math for booking conflict detection (FR-004, TD-2).
 *
 * Pure and store-independent: every backend (JSON, Firestore, Supabase)
 * shares this exact implementation so a conflict means the same thing
 * everywhere. Times are the client-facing 12-hour clock strings already
 * validated by `bookingSchema`; durations are minutes from the booked
 * service catalog. Buffer is 0 by decision (D2): back-to-back bookings
 * (10:00-11:00 then 11:00) never conflict.
 */

const SLOT_TIME_RE = /^(0?[1-9]|1[0-2]):([0-5]\d) (AM|PM)$/;

/** Minutes from midnight for a validated `h:mm AM/PM` string; null when malformed. */
export function parseSlotTime(time: string): number | null {
  const match = SLOT_TIME_RE.exec(time.trim());
  if (!match) return null;
  let hours = Number(match[1]) % 12; // 12 AM → 0, 12 PM → 12
  if (match[3] === 'PM') hours += 12;
  return hours * 60 + Number(match[2]);
}

export interface SlotWindow {
  /** Minutes from midnight, inclusive. */
  start: number;
  /** Minutes from midnight, exclusive (start + duration). */
  end: number;
}

/** Half-open [start, end) window for a booking; null for malformed inputs. */
export function slotWindow(time: string, durationMinutes: number): SlotWindow | null {
  const start = parseSlotTime(time);
  if (start === null) return null;
  if (!Number.isFinite(durationMinutes) || durationMinutes < 0) return null;
  return { start, end: start + durationMinutes };
}

/** Half-open interval overlap: shared boundaries do not overlap. */
export function windowsOverlap(a: SlotWindow, b: SlotWindow): boolean {
  return a.start < b.end && b.start < a.end;
}

/**
 * Absolute-instant helpers for stores that enforce conflicts in the
 * database (Supabase exclusion constraint). The salon wall-clock is
 * encoded as UTC on purpose: it is an internal overlap key only — display
 * always reads `data.time`, and every writer uses the same convention, so
 * comparisons stay consistent regardless of server timezone.
 */
export function slotStartIso(date: string, time: string): string | null {
  const minutes = parseSlotTime(time);
  if (minutes === null) return null;
  const [year, month, day] = date.split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(Date.UTC(year, month - 1, day, Math.floor(minutes / 60), minutes % 60)).toISOString();
}

export function slotEndIso(date: string, time: string, durationMinutes: number): string | null {
  const startIso = slotStartIso(date, time);
  if (startIso === null) return null;
  if (!Number.isFinite(durationMinutes) || durationMinutes < 0) return null;
  return new Date(new Date(startIso).getTime() + durationMinutes * 60_000).toISOString();
}

export interface SlotSource {
  date: string; // YYYY-MM-DD
  time: string; // h:mm AM/PM
  serviceDuration: number; // minutes
}

/**
 * True when two bookings claim the same staff member on the same date with
 * overlapping time windows (the frozen conflict definition, BR-1/BR-2 —
 * callers are responsible for excluding `cancelled` bookings). Malformed
 * rows (corrupt time/duration in legacy data) never conflict rather than
 * blocking the slot forever.
 */
export function bookingsConflict(a: SlotSource, b: SlotSource): boolean {
  if (a.date !== b.date) return false;
  const windowA = slotWindow(a.time, a.serviceDuration);
  const windowB = slotWindow(b.time, b.serviceDuration);
  if (!windowA || !windowB) return false;
  return windowsOverlap(windowA, windowB);
}
