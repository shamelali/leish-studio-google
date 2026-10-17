/**
 * Browser Supabase client for OAuth sign-in only. Sessions stay app JWTs:
 * after the provider redirects back, App exchanges the Supabase session
 * for an app session via POST /api/auth/oauth. Null when unconfigured.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// @ts-ignore Vite env typing (no vite/client types in this tsconfig)
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
// @ts-ignore
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabaseBrowser: SupabaseClient | null =
  url && anonKey ? createClient(url, anonKey) : null;

/** Starts OAuth sign-in with the given provider (redirects away; App picks up the session on return). */
export async function signInWithOAuth(provider: 'google' | 'facebook'): Promise<void> {
  if (!supabaseBrowser) {
    throw new Error('OAuth sign-in is not set up in this environment yet. Use email sign-in instead.');
  }
  const { error } = await supabaseBrowser.auth.signInWithOAuth({
    provider,
    options: { redirectTo: window.location.origin },
  });
  if (error) throw error;
}

/** Starts Google OAuth (redirects away; App picks up the session on return). */
export async function signInWithGoogle(): Promise<void> {
  return signInWithOAuth('google');
}

/** Starts Facebook OAuth (redirects away; App picks up the session on return). */
export async function signInWithFacebook(): Promise<void> {
  return signInWithOAuth('facebook');
}

/** Supabase access token of the current browser session, if any. */
export async function getSupabaseSessionToken(): Promise<string | null> {
  if (!supabaseBrowser) return null;
  try {
    const { data } = await supabaseBrowser.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}
