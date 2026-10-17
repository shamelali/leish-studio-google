import { describe, expect, it } from 'vitest';
import { bookingsConflict, parseSlotTime, slotWindow, windowsOverlap } from './slots.ts';

const at = (time: string, duration: number, date = '2026-10-20') => ({ date, time, serviceDuration: duration });

describe('parseSlotTime', () => {
  it.each([
    ['12:00 AM', 0],
    ['12:30 AM', 30],
    ['1:15 AM', 75],
    ['10:30 AM', 630],
    ['12:00 PM', 720],
    ['12:45 PM', 765],
    ['11:59 PM', 1439],
    ['09:05 PM', 1265],
  ])('parses %s → %i minutes', (time, expected) => {
    expect(parseSlotTime(time)).toBe(expected);
  });

  it.each(['whenever', '00:30 AM', '13:30 PM', '10:60 AM', '10:30', '10:30 am', ''])(
    'rejects malformed time %s',
    (time) => {
      expect(parseSlotTime(time)).toBeNull();
    },
  );
});

describe('slotWindow / windowsOverlap', () => {
  it('builds half-open windows from duration', () => {
    expect(slotWindow('10:30 AM', 120)).toEqual({ start: 630, end: 750 });
  });

  it('treats touching windows as non-overlapping (back-to-back allowed, D2)', () => {
    const morning = slotWindow('10:00 AM', 60)!;
    expect(windowsOverlap(morning, slotWindow('11:00 AM', 60)!)).toBe(false);
    expect(windowsOverlap(morning, slotWindow('9:00 AM', 60)!)).toBe(false);
  });

  it('flags partial overlaps on either side', () => {
    const morning = slotWindow('10:00 AM', 60)!;
    expect(windowsOverlap(morning, slotWindow('10:59 AM', 60)!)).toBe(true);
    expect(windowsOverlap(morning, slotWindow('9:30 AM', 31)!)).toBe(true);
    expect(windowsOverlap(morning, slotWindow('10:00 AM', 1)!)).toBe(true);
  });

  it('zero-duration windows conflict with nothing', () => {
    const zero = slotWindow('10:00 AM', 0)!;
    expect(windowsOverlap(zero, slotWindow('10:00 AM', 60)!)).toBe(false);
  });

  it('returns null for malformed windows', () => {
    expect(slotWindow('whenever', 60)).toBeNull();
    expect(slotWindow('10:00 AM', -5)).toBeNull();
    expect(slotWindow('10:00 AM', Number.NaN)).toBeNull();
  });
});

describe('bookingsConflict (AC-006 boundary matrix)', () => {
  const booked = at('10:30 AM', 120); // 10:30 → 12:30

  it('same staff, same date, nested start overlaps', () => {
    expect(bookingsConflict(booked, at('11:00 AM', 75))).toBe(true);
  });

  it('same staff, same date, overlap from the left', () => {
    expect(bookingsConflict(booked, at('9:00 AM', 120))).toBe(true);
  });

  it('exact same slot overlaps', () => {
    expect(bookingsConflict(booked, at('10:30 AM', 120))).toBe(true);
  });

  it('adjacent slots on both sides do not conflict', () => {
    expect(bookingsConflict(booked, at('12:30 PM', 75))).toBe(false);
    expect(bookingsConflict(booked, at('9:00 AM', 90))).toBe(false); // ends 10:30
  });

  it('same time on another date or via another clock format boundary does not conflict', () => {
    expect(bookingsConflict(booked, at('10:30 AM', 120, '2026-10-21'))).toBe(false);
  });

  it('legacy malformed rows never block the slot', () => {
    expect(bookingsConflict(booked, { date: '2026-10-20', time: 'corrupt', serviceDuration: 60 })).toBe(false);
    expect(bookingsConflict({ date: '2026-10-20', time: 'corrupt', serviceDuration: 60 }, booked)).toBe(false);
  });
});
