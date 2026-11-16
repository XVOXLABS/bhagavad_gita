import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

let client: SupabaseClient | null = null;

/** Returns true if Supabase project URL and Anon key are configured. */
export function isSupabaseConfigured(): boolean {
  return Boolean(supabaseUrl && supabaseAnonKey && supabaseUrl.startsWith('https://'));
}

/** Returns the initialized Supabase client singleton, or null if unconfigured. */
export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  client ??= createClient(supabaseUrl!, supabaseAnonKey!);
  return client;
}

/** Initiates Google OAuth Sign-In. Redirects to Google authentication screen. */
export async function signInWithGoogle(): Promise<{ error: Error | null }> {
  const sb = getSupabase();
  if (!sb) {
    return { error: new Error('Supabase is not configured. Please add keys to .env.local') };
  }
  const { error } = await sb.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: typeof window !== 'undefined' ? `${window.location.origin}/` : undefined,
    },
  });
  return { error: error ? new Error(error.message) : null };
}

/** Initiates Passwordless Magic Link Sign-In via Email. */
export async function signInWithEmail(email: string): Promise<{ error: Error | null }> {
  const sb = getSupabase();
  if (!sb) {
    return { error: new Error('Supabase is not configured. Please add keys to .env.local') };
  }
  const cleanEmail = email.trim();
  if (!cleanEmail || !cleanEmail.includes('@')) {
    return { error: new Error('Please enter a valid email address.') };
  }
  const { error } = await sb.auth.signInWithOtp({
    email: cleanEmail,
    options: {
      emailRedirectTo: typeof window !== 'undefined' ? `${window.location.origin}/` : undefined,
    },
  });
  return { error: error ? new Error(error.message) : null };
}

/** Signs the current user out. */
export async function signOut(): Promise<{ error: Error | null }> {
  const sb = getSupabase();
  if (!sb) return { error: null };
  const { error } = await sb.auth.signOut();
  return { error: error ? new Error(error.message) : null };
}

/** Gets the currently authenticated user (if any). */
export async function getCurrentUser(): Promise<User | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.auth.getUser();
  return data.user ?? null;
}
