import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

// Auth schemas
export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const registerSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters').max(100),
  role: z.enum(['client', 'provider']).optional(),
  phone: z.string().optional(),
  salonId: z.string().optional(),
  bio: z.string().max(500).optional(),
});

// Booking schema
export const bookingSchema = z.object({
  salonId: z.string().min(1),
  serviceId: z.string().min(1),
  staffId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  time: z.string().min(1),
  clientName: z.string().min(1).max(100),
  clientEmail: z.string().email('Invalid email address'),
  clientPhone: z.string().optional(),
  notes: z.string().max(1000).optional(),
  isLocationEvent: z.boolean().optional(),
  eventVenue: z.string().max(200).optional(),
  travelSurcharge: z.number().optional(),
});

// Review schema
export const reviewSchema = z.object({
  salonId: z.string().min(1),
  clientName: z.string().min(1).max(100),
  rating: z.number().int().min(1).max(5),
  text: z.string().min(1).max(2000),
});

// Profile schema
export const profileSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(100).optional(),
  phone: z.string().optional(),
  bio: z.string().max(500).optional(),
  avatar: z.string().url().optional(),
  salonId: z.string().optional(),
});

// Form hooks
export const useLoginForm = () =>
  useForm({ resolver: zodResolver(loginSchema) });

export const useRegisterForm = () =>
  useForm({ resolver: zodResolver(registerSchema) });

export const useBookingForm = () =>
  useForm({ resolver: zodResolver(bookingSchema) });

export const useReviewForm = () =>
  useForm({ resolver: zodResolver(reviewSchema) });

export const useProfileForm = () =>
  useForm({ resolver: zodResolver(profileSchema) });
