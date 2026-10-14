import { z } from 'zod';

const requiredText = (max: number) => z.string().trim().min(1).max(max);
const nonNegativeNumber = z.number().finite().nonnegative();
const imageUrl = z.string().trim().max(2048).url().refine(
  value => /^https?:\/\//i.test(value),
  'Image URL must use http or https',
);

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return year > 0 && month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth[month - 1];
}

// This is the compact Booking attachment, not the full LookbookItem response.
// Bound both the payload and individual display fields; reject unexpected keys.
const moodboardSchema = z.object({
  lookName: requiredText(120),
  palette: z.array(z.object({
    hex: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Palette colors must be six-digit hex colors'),
    name: requiredText(80),
  }).strict()).min(1).max(10),
  lipFormula: requiredText(500),
  eyeStyle: requiredText(500),
}).strict();

export const bookingSchema = z.object({
  salonId: requiredText(120),
  serviceId: requiredText(120),
  staffId: requiredText(120),
  date: z.string().refine(isCalendarDate, 'Date must be a valid calendar date in YYYY-MM-DD format'),
  // Preserve the caller's 12-hour clock representation, including leading zeros.
  time: z.string().regex(/^(0?[1-9]|1[0-2]):[0-5]\d (AM|PM)$/, 'Time must be a valid h:mm AM/PM time'),
  clientName: requiredText(100),
  clientEmail: z.string().trim().max(254).email(),
  clientPhone: requiredText(50),
  notes: z.string().max(1000).optional(),
  isLocationEvent: z.boolean().optional(),
  eventVenue: z.string().trim().max(200).optional(),
  travelSurcharge: nonNegativeNumber.optional(),
  attachedMoodboard: moodboardSchema.optional(),
}).refine(data => !data.isLocationEvent || Boolean(data.eventVenue), {
  message: 'A venue is required for an on-location booking',
  path: ['eventVenue'],
});

const serviceFieldsSchema = z.object({
  name: requiredText(120),
  price: nonNegativeNumber,
  duration: z.number().finite().positive(),
  description: z.string().max(1000),
  category: requiredText(100),
});

const serviceSchema = serviceFieldsSchema.extend({ id: requiredText(120) });

/** Partial service fields for an owner editing one existing catalogue item. */
export const serviceUpdateSchema = serviceFieldsSchema.partial().refine(
  value => Object.keys(value).length > 0,
  'Provide at least one service field to update.',
);

const staffSchema = z.object({
  id: requiredText(120),
  name: requiredText(100),
  role: requiredText(200),
  avatar: imageUrl,
  rating: z.number().finite().min(0).max(5),
});

// WorkingHours is a weekday -> display string map. The dashboard edits free
// text (including "Closed" and "By appointment"), not structured clock ranges.
const hoursText = z.string().trim().max(100).optional();
const workingHoursSchema = z.object({
  Monday: hoursText,
  Tuesday: hoursText,
  Wednesday: hoursText,
  Thursday: hoursText,
  Friday: hoursText,
  Saturday: hoursText,
  Sunday: hoursText,
}).strict();

// Partial only at the top level: supplied collections contain complete typed
// entries. Unknown top-level fields are stripped, retaining the existing
// allowlist contract for id/type/rating/reviewCount and other protected data.
export const salonUpdateSchema = z.object({
  name: requiredText(120),
  tagline: z.string().trim().max(300),
  description: z.string().max(5000),
  location: requiredText(200),
  address: requiredText(500),
  category: requiredText(100),
  workingHours: workingHoursSchema,
  services: z.array(serviceSchema).max(100),
  staff: z.array(staffSchema).max(100),
  image: imageUrl,
  gallery: z.array(imageUrl).max(50),
  featured: z.boolean(),
  artistTitle: z.string().trim().max(200),
  yearsExperience: nonNegativeNumber.int(),
  kitBrands: z.array(requiredText(100)).max(50),
  travelRadius: z.string().trim().max(200),
  instagramHandle: z.string().trim().max(100),
  startingPrice: nonNegativeNumber,
}).partial();
