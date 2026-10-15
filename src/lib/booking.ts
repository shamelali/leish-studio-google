import { z } from 'zod';
import type { Booking, LookbookItem, Salon, Service, WorkingHours } from '../types';

export const bookingFormSchema = z.object({
  clientName: z.string().trim().min(1, 'Enter your full name.').max(100, 'Use 100 characters or fewer for your name.'),
  // Demo accounts use short usernames (`client` / `studio`); accept any
  // non-empty contact identifier so a signed-in demo user can complete a
  // booking without retyping a real email address.
  clientEmail: z.string().trim().min(1, 'Enter your contact email or username.').max(254, 'Use an email address of 254 characters or fewer.'),
  clientPhone: z.string().trim().min(1, 'Enter your telephone number.').max(50, 'Use 50 characters or fewer for your telephone number.'),
  notes: z.string().max(1000, 'Keep special instructions to 1,000 characters or fewer.').optional(),
  isLocationEvent: z.boolean(),
  eventVenue: z.string().trim(),
}).superRefine((data, context) => {
  if (data.isLocationEvent && !data.eventVenue) {
    context.addIssue({ code: 'custom', path: ['eventVenue'], message: 'Enter the venue or hotel address for an on-location appointment.' });
  } else if (data.isLocationEvent && data.eventVenue.length > 200) {
    context.addIssue({ code: 'custom', path: ['eventVenue'], message: 'Keep the venue address to 200 characters or fewer.' });
  }
});

export type BookingFormData = z.infer<typeof bookingFormSchema>;

export const bookingTravelQuoteSchema = z.object({
  distanceKm: z.number().finite().nonnegative(),
  estimatedDriveMinutes: z.number().finite().nonnegative(),
  totalTravelFee: z.number().finite().nonnegative(),
  baseKitFee: z.number().finite().nonnegative(),
  mileageFee: z.number().finite().nonnegative(),
  estimateSource: z.string().optional(),
});
export type BookingTravelQuote = z.infer<typeof bookingTravelQuoteSchema>;

export const bookingTimeSlots = [
  '09:00 AM', '10:30 AM', '11:00 AM', '12:30 PM',
  '01:30 PM', '03:00 PM', '04:30 PM', '05:00 PM', '06:30 PM',
];

export function getBookingDates(workingHours: WorkingHours, today = new Date()) {
  const dates: { value: string; day: string; number: number; month: string }[] = [];
  for (let i = 1; i <= 14; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);
    const weekday = date.toLocaleDateString('en-US', { weekday: 'long' }) as keyof WorkingHours;
    if (weekday === 'Sunday' || workingHours[weekday] === 'Closed') continue;
    const pad = (value: number) => String(value).padStart(2, '0');
    // Keep date-only values local: UTC conversion can change the calendar day.
    dates.push({
      value: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
      day: date.toLocaleDateString('en-US', { weekday: 'short' }),
      number: date.getDate(),
      month: date.toLocaleDateString('en-US', { month: 'short' }),
    });
  }
  return dates;
}

export function formatBookingDate(value: string) {
  if (!value) return '';
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
}

export function getBookingScheduleErrors(date: string, time: string, workingHours: WorkingHours, today = new Date()) {
  return {
    date: !date ? 'Choose an appointment date.' : !getBookingDates(workingHours, today).some(option => option.value === date)
      ? 'Choose a new date from the available options.' : undefined,
    time: !bookingTimeSlots.includes(time) ? 'Choose an appointment time.' : undefined,
  };
}

export function getBookingTravelFee(isLocationEvent: boolean, quote: BookingTravelQuote | null) {
  return isLocationEvent ? quote?.totalTravelFee ?? 50 : 0;
}

export type BookingRequest = Pick<Booking,
  'salonId' | 'serviceId' | 'staffId' | 'date' | 'time' | 'clientName' | 'clientEmail' | 'clientPhone' | 'notes' |
  'isLocationEvent' | 'eventVenue' | 'travelSurcharge' | 'attachedMoodboard'
>;

// Snapshot the validated details for review. Submission uses this same snapshot.
export function buildBookingRequest(data: BookingFormData, context: {
  salon: Salon;
  service: Service;
  staffId: string;
  date: string;
  time: string;
  travelQuote: BookingTravelQuote | null;
  attachedMoodboard?: LookbookItem | null;
}): BookingRequest {
  const details = bookingFormSchema.parse(data);
  const moodboard = context.attachedMoodboard;
  return {
    salonId: context.salon.id,
    serviceId: context.service.id,
    staffId: context.staffId,
    date: context.date,
    time: context.time,
    clientName: details.clientName,
    clientEmail: details.clientEmail,
    clientPhone: details.clientPhone,
    notes: details.notes,
    isLocationEvent: details.isLocationEvent,
    eventVenue: details.isLocationEvent ? details.eventVenue : undefined,
    travelSurcharge: getBookingTravelFee(details.isLocationEvent, context.travelQuote),
    attachedMoodboard: moodboard ? {
      lookName: moodboard.lookName,
      palette: moodboard.colorPalette,
      lipFormula: `${moodboard.lipFormula.shade} (${moodboard.lipFormula.finish})`,
      eyeStyle: moodboard.eyeArtistry.style,
    } : undefined,
  };
}
