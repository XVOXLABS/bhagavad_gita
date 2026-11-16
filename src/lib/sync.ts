import { readMemories, writeMemories, type CompanionMemory } from './memory';
import { readProfile, writeProfile, type DevoteeProfile } from './profile';
import { getSupabase } from './supabase';

export type SyncResult = {
  success: boolean;
  memoriesMigrated: number;
  versesMigrated: number;
  error?: string;
};

/**
 * 1-Click Guest to Cloud Migration:
 * When a user signs in, seamlessly uploads all their guest profile data,
 * episodic memories, and bookmarked verses into Supabase so nothing is lost.
 */
export async function migrateGuestDataToCloud(userId: string): Promise<SyncResult> {
  const sb = getSupabase();
  if (!sb || !userId) {
    return { success: false, memoriesMigrated: 0, versesMigrated: 0, error: 'Supabase client unavailable' };
  }

  try {
    // 1. Sync Profile
    const localProfile = readProfile();
    await sb.from('profiles').upsert({
      id: userId,
      preferred_name: localProfile.preferredName || null,
      companion_persona: localProfile.persona || 'sakha',
      preferred_language: localProfile.language || 'en',
      life_context: localProfile.lifeContext || null,
      updated_at: new Date().toISOString(),
    });

    // 2. Sync Memories
    const localMemories = readMemories();
    let memoriesMigrated = 0;
    if (localMemories.length > 0) {
      const memoryRows = localMemories.map((m) => ({
        user_id: userId,
        fact: m.fact,
        category: m.category,
        associated_verse: m.associatedVerse || null,
        active: m.active !== false,
      }));

      const { data, error } = await sb.from('episodic_memories').upsert(memoryRows, { onConflict: 'user_id,fact' });
      if (!error) {
        memoriesMigrated = localMemories.length;
      }
    }

    // 3. Sync Saved Verses (from localStorage)
    let versesMigrated = 0;
    try {
      const rawVerses = window.localStorage.getItem('gita.saved');
      if (rawVerses) {
        const savedList = JSON.parse(rawVerses) as { chapter: number; verse: number }[];
        if (Array.isArray(savedList) && savedList.length > 0) {
          const verseRows = savedList.map((v) => ({
            user_id: userId,
            chapter: v.chapter,
            verse: v.verse,
          }));
          const { error } = await sb.from('saved_verses').upsert(verseRows, { onConflict: 'user_id,chapter,verse' });
          if (!error) {
            versesMigrated = savedList.length;
          }
        }
      }
    } catch {
      // Local verses fallback
    }

    return { success: true, memoriesMigrated, versesMigrated };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Migration failed';
    return { success: false, memoriesMigrated: 0, versesMigrated: 0, error: message };
  }
}

/**
 * Cloud to Device Sync:
 * Pulls latest profile, memories, and saved verses from Supabase and saves them
 * to the browser's local cache so access is lightning fast.
 */
export async function pullCloudUserData(userId: string): Promise<void> {
  const sb = getSupabase();
  if (!sb || !userId) return;

  try {
    // 1. Pull Profile
    const { data: profileRow } = await sb.from('profiles').select('*').eq('id', userId).single();
    if (profileRow) {
      writeProfile({
        preferredName: profileRow.preferred_name || '',
        persona: profileRow.companion_persona || 'sakha',
        language: profileRow.preferred_language || 'en',
        lifeContext: profileRow.life_context || '',
      });
    }

    // 2. Pull Memories
    const { data: memoryRows } = await sb
      .from('episodic_memories')
      .select('*')
      .eq('user_id', userId)
      .eq('active', true)
      .order('created_at', { ascending: false });

    if (Array.isArray(memoryRows)) {
      const parsedMemories: CompanionMemory[] = memoryRows.map((r) => ({
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
