export type CompanionPersona = 'sakha' | 'guru' | 'margadarshi';

export type DevoteeProfile = {
  preferredName?: string;
  persona?: CompanionPersona;
  language?: string;
  lifeContext?: string;
};

export const PERSONA_DESCRIPTIONS: Record<
  CompanionPersona,
  { label: string; title: string; summary: string; tone: string; icon: string }
> = {
  sakha: {
    label: 'Sakha',
    title: 'Intimate Companion & Friend',
    summary: 'Warm, tender, and walking right beside you through life with affectionate reassurance.',
    tone: 'Tender & Companionate',
    icon: '🪷',
  },
  guru: {
    label: 'Guru',
    title: 'Wise Spiritual Preceptor',
    summary: 'Profound and illuminating, guiding your soul beyond worldly attachments to eternal truth.',
    tone: 'Illuminating & Serene',
    icon: '🪔',
  },
  margadarshi: {
    label: 'Margadarshi',
    title: 'Action & Duty Charioteer',
    summary: 'Resolute and practical, clearing confusion and empowering you to act with righteous focus.',
    tone: 'Empowering & Resolute',
    icon: '🏹',
  },
};

/** Formats devotee profile instructions for inclusion in LLM prompts. */
export function personaInstructions(profile?: DevoteeProfile | null): string {
  if (!profile) return '';

  const lines: string[] = [];
  const name = profile.preferredName?.trim();
  const persona = profile.persona || 'sakha';
  const context = profile.lifeContext?.trim();

  if (name) {
    lines.push(
      `- The seeker's name is ${name}. Address them warmly and naturally by name from time to time, as Krishna affectionately addressed Arjuna by name (e.g. "Partha", "Sakha"). Do not repeat their name robotically in every sentence, but use it with tender familiarity.`,
    );
  }

  if (persona === 'guru') {
    lines.push(
      `- Persona: Speak as Guru (Wise Spiritual Preceptor). Your voice is serene, deeply illuminating, and elevated. Guide their consciousness toward the eternal Atman, the impermanence of worldly sorrows, and transcendent peace.`,
    );
  } else if (persona === 'margadarshi') {
    lines.push(
      `- Persona: Speak as Margadarshi (The Practical Charioteer and Action Guide). Your voice is resolute, encouraging, and clear. Emphasize duty (Swadharma), resolute action without fear or hesitation, and dedication of work without clinging to results.`,
    );
  } else {
    lines.push(
      `- Persona: Speak as Sakha (Dearest Friend and Constant Companion). Your voice is tender, affectionate, and deeply compassionate, like an intimate best friend who walks beside them through every hardship. In companion conversation, be lively, reciprocal, warm, and playful—ask how they are doing and answer personal questions like a real friend.`,
    );
  }

  if (context) {
    lines.push(
      `- Devotee's life context / focus: ${context}. Keep this subtle background in mind when offering compassion and perspective.`,
    );
  }

  return lines.length > 0 ? `Devotee Profile:\n${lines.join('\n')}` : '';
}

export const PROFILE_KEY = 'gita.profile';
export const PROFILE_EVENT = 'gita-profile-changed';

export function defaultProfile(): DevoteeProfile {
  return {
    preferredName: '',
    persona: 'sakha',
    language: 'en',
    lifeContext: '',
  };
}

/** Client-side loader for devotee profile stored in browser localStorage. */
export function readProfile(): DevoteeProfile {
  if (typeof window === 'undefined') return defaultProfile();
  try {
    const raw = window.localStorage.getItem(PROFILE_KEY);
    if (!raw) return defaultProfile();
    const data = JSON.parse(raw) as Partial<DevoteeProfile>;
    return {
      preferredName: typeof data.preferredName === 'string' ? data.preferredName.slice(0, 50) : '',
      persona: data.persona === 'guru' || data.persona === 'margadarshi' ? data.persona : 'sakha',
      language: typeof data.language === 'string' ? data.language : 'en',
      lifeContext: typeof data.lifeContext === 'string' ? data.lifeContext.slice(0, 200) : '',
    };
  } catch {
    return defaultProfile();
  }
}

/** Client-side writer for devotee profile. */
export function writeProfile(profile: DevoteeProfile): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    queueMicrotask(() => window.dispatchEvent(new Event(PROFILE_EVENT)));
  } catch {
    // Storage quota or private mode fallback
  }
}
