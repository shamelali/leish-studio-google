/**
 * JWT secret resolution (TR-9), extracted from the server.ts monolith.
 */

/**
 * Resolve the JWT signing secret from the environment.
 *
 * The optional arguments make the production boot contract independently
 * testable without re-importing the Express singleton. Development/test keeps
 * the historical fallback so local setup remains frictionless; production
 * never accepts an empty value or a documented placeholder.
 */
export function getJwtSecret(
  environment = process.env.NODE_ENV,
  configuredSecret = process.env.JWT_SECRET,
): string {
  const secret = configuredSecret?.trim();
  const isPlaceholder = !secret || [
    'leish-dev-secret-change-in-production',
    'MY_JWT_SECRET',
    'YOUR_JWT_SECRET_HERE',
  ].includes(secret) || /^(MY_|YOUR_|GENERATE_)/i.test(secret);
  const isWeak = Boolean(secret && secret.length < 32);

  if (environment === 'production' && (isPlaceholder || isWeak)) {
    throw new Error(
      '[leish] JWT_SECRET is not set (or is a placeholder). Refusing to boot in production with an unsafe signing secret (TR-9).'
    );
  }

  if (isWeak) {
    console.warn('[leish] JWT_SECRET is weak (<32 chars). Use a strong secret even in development.');
  }
  if (isPlaceholder && environment !== 'production') {
    console.warn('[leish] JWT_SECRET is a placeholder. Set a strong secret in production.');
  }

  return secret || 'leish-dev-secret-change-in-production';
}
