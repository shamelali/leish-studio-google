/**
 * Identifier generation helpers shared by the API route layer.
 */

const randomSuffix = (): string => Math.random().toString(36).slice(2, 8);

export const generateUserId = (): string => `user-${Date.now()}-${randomSuffix()}`;
export const generateSalonId = (): string => `salon-${Date.now()}-${randomSuffix()}`;
export const generateServiceId = (salonId: string): string => `serv-${salonId}-${Date.now()}`;
export const generateBookingId = (): string => `book-${Date.now()}-${randomSuffix()}`;
export const generateReviewId = (): string => `rev-${Date.now()}-${randomSuffix()}`;
export const generateLookId = (): string => `look-${Date.now()}`;

/** Opaque placeholder password for OAuth-backed accounts (never used for login). */
export const generateOauthPlaceholderPassword = (): string =>
  `oauth-${Date.now()}-${Math.random().toString(36).slice(2, 18)}`;
