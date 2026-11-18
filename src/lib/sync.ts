import { readMemories, writeMemories, type CompanionMemory } from './memory';
import { readProfile, writeProfile } from './profile';
import { getSupabase } from './supabase';

export const AUTO_SYNC_KEY = 'gita.auto_sync';
export const LAST_SYNCED_KEY = 'gita.last_synced_at';

export type SyncResult = {
  success: boolean;
  memoriesMigrated: number;
  versesMigrated: number;
  error?: string;
};

/** Checks if user has enabled background auto-sync (defaults to true). */
export function isAutoSyncEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const val = window.localStorage.getItem(AUTO_SYNC_KEY);
    return val === null ? true : val !== '0' && val !== 'false';
  } catch {
    return true;
  }
}

/** Updates user preference for background auto-sync. */
export function setAutoSyncEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(AUTO_SYNC_KEY, enabled ? '1' : '0');
  } catch {
    // ignore
  }
}

/** Reads timestamp of last successful sync. */
export function getLastSyncedAt(): number | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(LAST_SYNCED_KEY);
    return raw ? parseInt(raw, 10) : null;
  } catch {
    return null;
  }
}

/** Records timestamp of last successful sync. */
export function setLastSyncedAt(ts: number): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LAST_SYNCED_KEY, String(ts));
  } catch {
    // ignore
  }
}

/** Human readable format for last sync timestamp. */
export function formatLastSynced(ts: number | null): string {
  if (!ts) return '';
  const diffSec = Math.floor((Date.now() - ts) / 1000);
  if (diffSec < 10) return 'Just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

/**
 * 1-Click Guest to Cloud Migration & Cloud Push:
 * Concurrently uploads profile data, episodic memories, and bookmarked verses into Supabase.
 */
export async function migrateGuestDataToCloud(userId: string): Promise<SyncResult> {
  const sb = getSupabase();
  if (!sb || !userId) {
    return { success: false, memoriesMigrated: 0, versesMigrated: 0, error: 'Supabase client unavailable' };
  }

  try {
    const localProfile = readProfile();
    const localMemories = readMemories();

    // 1. Push Profile (concurrent)
    const profilePromise = sb.from('profiles').upsert({
      id: userId,
      preferred_name: localProfile.preferredName || null,
      companion_persona: localProfile.persona || 'sakha',
      preferred_language: localProfile.language || 'en',
      life_context: localProfile.lifeContext || null,
      updated_at: new Date().toISOString(),
    });

    // 2. Push Memories (concurrent)
    const memoryPromise = (async () => {
      if (localMemories.length === 0) return 0;
      const memoryRows = localMemories.map((m) => ({
        user_id: userId,
        fact: m.fact,
        category: m.category,
        associated_verse: m.associatedVerse || null,
        active: m.active !== false,
      }));

      const { error } = await sb.from('episodic_memories').upsert(memoryRows, { onConflict: 'user_id,fact' });
      return error ? 0 : localMemories.length;
    })();

    // 3. Push Saved Verses (concurrent)
    const versesPromise = (async () => {
      try {
        const rawVerses = typeof window !== 'undefined' ? window.localStorage.getItem('gita.saved') : null;
        if (!rawVerses) return 0;
        const savedList = JSON.parse(rawVerses) as { chapter: number; verse: number }[];
        if (Array.isArray(savedList) && savedList.length > 0) {
          const verseRows = savedList.map((v) => ({
            user_id: userId,
            chapter: v.chapter,
            verse: v.verse,
          }));
          const { error } = await sb.from('saved_verses').upsert(verseRows, { onConflict: 'user_id,chapter,verse' });
          return error ? 0 : savedList.length;
        }
      } catch {
        // Local verses fallback
      }
      return 0;
    })();

    const [, memoriesMigrated, versesMigrated] = await Promise.all([
      profilePromise,
      memoryPromise,
      versesPromise,
    ]);

    return { success: true, memoriesMigrated, versesMigrated };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Migration failed';
    return { success: false, memoriesMigrated: 0, versesMigrated: 0, error: message };
  }
}

/**
 * Cloud to Device Sync:
 * Concurrently pulls latest profile and memories from Supabase and saves them
 * to the browser's local cache so access is lightning fast.
 */
export async function pullCloudUserData(userId: string): Promise<void> {
  const sb = getSupabase();
  if (!sb || !userId) return;

  try {
    const [profileRes, memRes] = await Promise.all([
      sb.from('profiles').select('*').eq('id', userId).single(),
      sb.from('episodic_memories').select('*').eq('user_id', userId).eq('active', true).order('created_at', { ascending: false }),
    ]);

    // Update Profile
    if (profileRes.data) {
      writeProfile({
        preferredName: profileRes.data.preferred_name || '',
        persona: profileRes.data.companion_persona || 'sakha',
        language: profileRes.data.preferred_language || 'en',
        lifeContext: profileRes.data.life_context || '',
      });
    }

    // Update Memories
    if (Array.isArray(memRes.data) && memRes.data.length > 0) {
      const parsedMemories: CompanionMemory[] = memRes.data.map((r) => ({
        id: r.id,
        fact: r.fact,
        category: r.category,
        createdAt: new Date(r.created_at).getTime(),
        associatedVerse: r.associated_verse || undefined,
        active: r.active !== false,
      }));
      writeMemories(parsedMemories);
    }
  } catch {
    // Network or offline fallback
  }
}

/**
 * Complete Two-Way Sync:
 * Pushes local state to cloud and pulls any remote updates, recording the timestamp.
 */
export async function syncUserData(userId: string): Promise<SyncResult> {
  const pushRes = await migrateGuestDataToCloud(userId);
  await pullCloudUserData(userId);
  if (pushRes.success) {
    setLastSyncedAt(Date.now());
  }
  return pushRes;
}
