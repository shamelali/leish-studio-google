/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Service {
  id: string;
  name: string;
  price: number;
  duration: number; // in minutes
  description: string;
  category: string;
}

export interface StaffMember {
  id: string;
  name: string;
  role: string;
  avatar: string;
  rating: number;
}

export interface WorkingHours {
  Monday?: string;
  Tuesday?: string;
  Wednesday?: string;
  Thursday?: string;
  Friday?: string;
  Saturday?: string;
  Sunday?: string;
}

export type EntityType = 'studio' | 'mua';

export interface Salon {
  id: string;
  name: string;
  tagline: string;
  description: string;
  rating: number;
  reviewCount: number;
  location: string;
  address: string;
  image: string;
  gallery: string[];
  category: 'bridal' | 'editorial' | 'soft-glam' | 'airbrush' | 'masterclass' | 'glam' | string;
  services: Service[];
  staff: StaffMember[];
  featured: boolean;
  workingHours: WorkingHours;
  type?: EntityType;
  artistTitle?: string;
  yearsExperience?: number;
  kitBrands?: string[];
  travelRadius?: string;
  instagramHandle?: string;
  startingPrice?: number;
}

export type BookingStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled';

export interface Booking {
  id: string;
  salonId: string;
  salonName: string;
  salonAddress: string;
  serviceId: string;
  serviceName: string;
  servicePrice: number;
  serviceDuration: number;
  staffId: string;
  staffName: string;
  date: string; // YYYY-MM-DD
  time: string; // e.g. "10:30 AM"
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  /** Stable identifier of the client who created the booking. Used for authorization. */
  clientId?: string;
  notes?: string;
  status: BookingStatus;
  createdAt: string;
  /** True when the contact email was verified (own account email or OTP). */
  contactVerified?: boolean;
  isLocationEvent?: boolean;
  eventVenue?: string;
  travelSurcharge?: number;
  attachedMoodboard?: {
    lookName: string;
    palette: { hex: string; name: string }[];
    lipFormula: string;
    eyeStyle: string;
  };
}

export interface Review {
  id: string;
  salonId: string;
  clientName: string;
  rating: number;
  text: string;
  date: string;
  /** Present on reviews created through the authenticated API. */
  reviewerId?: string;
  /** Present on reviews tied to a completed booking; legacy seed reviews omit it. */
  bookingId?: string;
}

export interface LookbookItem {
  id: string;
  lookName: string;
  category: string;
  vibeDescription: string;
  colorPalette: { hex: string; name: string }[];
  complexion: {
    finish: string;
    coverage: string;
    technique: string;
  };
  eyeArtistry: {
    style: string;
    lashStyle: string;
  };
  lipFormula: {
    shade: string;
    finish: string;
    liner: string;
  };
  longevityFeatures: string[];
  groundedTrendContext?: string;
  recommendedSalonId?: string;
  /** Canonical catalogue service ID when the model provides one. */
  recommendedServiceId?: string;
  recommendedServiceName?: string;
  heroImage?: string;
  lightingBestFor?: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'client' | 'provider' | 'admin';
  phone?: string;
  avatar?: string;
  salonId?: string;
  bio?: string;
  createdAt: string;
}

export interface AuthResponse {
  user: User;
  token: string;
  message?: string;
}

export interface AIAdviceRequest {
  goals: string;
  skinHairType: string;
  occasion: string;
  preferredCategory?: string;
}

export interface AIAdviceResponse {
  source: 'model' | 'fallback';
  recommendationText: string;
  suggestedServices: {
    serviceName: string;
    /** Present when the model response includes a canonical catalogue ID. */
    serviceId?: string;
    category: string;
    salonName: string;
    salonId: string;
    estimatedPrice: number;
    reason: string;
  }[];
}

export interface AIReviewSummaryResponse {
  source: 'model' | 'fallback';
  vibe: string;
  bestFor: string;
  tip: string;
}
