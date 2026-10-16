/**
 * Supabase Auth bridge (credentials only — sessions stay app JWTs).
 *
 * When SUPABASE_URL + SUPABASE_ANON_KEY are configured, password
 * verification and OAuth identity move to Supabase Auth while the app keeps
 * minting its own HS256 session tokens, so the client session shape,
 * authenticateToken middleware, and authorization model are unchanged.
 * Without configuration every helper returns null and callers fall back to
 * the legacy bcrypt/JWT path (local dev, offline tests).
 */
import { createClient, type SupabaseClient, type User as SupabaseUser } from '@supabase/supabase-js';

export interface VerifiedIdentity {
  id: string;
  email: string;
  name?: string;
  avatar?: string;
}

const baseClient = (): SupabaseClient | null => {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
};

const adminClient = (): SupabaseClient | null => {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
};

export function isSupabaseAuthConfigured(): boolean {
  return baseClient() !== null;
}

/** Verify a Supabase access token (password sign-in or OAuth session). */
export async function verifySupabaseToken(accessToken: string): Promise<VerifiedIdentity | null> {
  const client = baseClient();
  if (!client || !accessToken) return null;
  try {
    const { data, error } = await client.auth.getUser(accessToken);
    if (error || !data.user?.email) return null;
    return toIdentity(data.user);
  } catch {
    return null;
  }
}

/** Verify email + password against Supabase Auth. */
export async function verifySupabasePassword(email: string, password: string): Promise<VerifiedIdentity | null> {
  const client = baseClient();
  if (!client) return null;
  try {
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error || !data.user?.email) return null;
    return toIdentity(data.user);
  } catch {
    return null;
  }
}

/** Create a pre-confirmed Supabase Auth user (registration path). */
export async function createSupabaseUser(
  email: string,
  password: string,
  name: string,
): Promise<VerifiedIdentity | null> {
  const admin = adminClient();
  if (!admin) return null;
  try {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name },
    });
    if (error || !data.user?.email) return null;
    return toIdentity(data.user);
  } catch {
    return null;
  }
}

/** Best-effort orphan cleanup when profile creation fails after Auth creation. */
export async function deleteSupabaseUser(authId: string): Promise<void> {
  const admin = adminClient();
  if (!admin) return;
  try {
    await admin.auth.admin.deleteUser(authId);
  } catch {
    // Orphan remains for manual cleanup; never fail the request over it.
  }
}

function toIdentity(user: SupabaseUser): VerifiedIdentity {
  const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
  return {
    id: user.id,
    email: user.email as string,
    name: typeof metadata.name === 'string' ? metadata.name : undefined,
    avatar: typeof metadata.avatar_url === 'string' ? metadata.avatar_url : undefined,
  };
}
