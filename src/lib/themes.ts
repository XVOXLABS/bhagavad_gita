export type ThemeId =
  | 'fear-anxiety'
  | 'grief-loss'
  | 'anger'
  | 'confusion-doubt'
  | 'duty-action'
  | 'results-detachment'
  | 'success-failure'
  | 'devotion-surrender'
  | 'faith-trust'
  | 'death-impermanence'
  | 'peace-equanimity'
  | 'desire-attachment'
  | 'mind-discipline'
  | 'self-soul'
  | 'guilt-redemption'
  | 'courage-self-worth'
  | 'relationships-family'
  | 'ego-pride'
  | 'selfless-service'
  | 'purpose-own-path'
  | 'wisdom-knowledge'
  | 'divine-nature'
  | 'virtue-character'
  | 'lifestyle-balance'
  | 'narrative';

export type Theme = {
  id: ThemeId;
  label: string;
  /** Everyday words people use for this theme, matched against the user's message. */
  keywords: string[];
};

export const THEMES: Theme[] = [
  {
    id: 'fear-anxiety',
    label: 'Fear and anxiety',
    keywords: ['fear', 'afraid', 'scared', 'anxiety', 'anxious', 'worry', 'worried', 'panic', 'nervous', 'dread', 'terrified', 'bayam', 'dar', 'darr', 'tension', 'future'],
  },
  {
    id: 'grief-loss',
    label: 'Grief and loss',
    keywords: ['grief', 'grieve', 'sorrow', 'sad', 'sadness', 'loss', 'lost', 'died', 'death', 'passed', 'mourn', 'miss', 'cry', 'crying', 'depressed', 'heartbroken', 'dukh', 'udaas'],
  },
  {
    id: 'anger',
    label: 'Anger',
    keywords: ['anger', 'angry', 'rage', 'furious', 'irritated', 'frustrated', 'hate', 'resent', 'revenge', 'gussa', 'kopam'],
  },
  {
    id: 'confusion-doubt',
    label: 'Confusion and doubt',
    keywords: ['confused', 'confusion', 'doubt', 'unsure', 'uncertain', 'dilemma', 'decide', 'decision', 'choice', 'lost', 'stuck', 'which'],
  },
  {
    id: 'duty-action',
    label: 'Duty and action',
    keywords: ['duty', 'work', 'job', 'action', 'act', 'responsibility', 'lazy', 'procrastinate', 'procrastination', 'motivation', 'effort', 'karma'],
  },
  {
    id: 'results-detachment',
    label: 'Letting go of results',
    keywords: ['result', 'results', 'outcome', 'exam', 'marks', 'promotion', 'pressure', 'expectation', 'reward', 'interview'],
  },
  {
    id: 'success-failure',
    label: 'Success and failure',
    keywords: ['fail', 'failed', 'failure', 'success', 'win', 'lose', 'losing', 'rejected', 'rejection', 'praise', 'criticism', 'insult', 'blame'],
  },
  {
    id: 'devotion-surrender',
    label: 'Devotion and surrender',
    keywords: ['god', 'krishna', 'surrender', 'devotion', 'pray', 'prayer', 'worship', 'love', 'refuge', 'bhakti'],
  },
  {
    id: 'faith-trust',
    label: 'Faith and trust',
    keywords: ['faith', 'trust', 'believe', 'belief', 'hope', 'hopeless', 'alone', 'lonely', 'abandoned', 'protect', 'support'],
  },
  {
    id: 'death-impermanence',
    label: 'Death and impermanence',
    keywords: ['death', 'die', 'dying', 'mortal', 'impermanent', 'temporary', 'change', 'old', 'aging', 'illness', 'sick', 'disease'],
  },
  {
    id: 'peace-equanimity',
    label: 'Peace and equanimity',
    keywords: ['peace', 'calm', 'stress', 'stressed', 'overwhelmed', 'restless', 'balance', 'stable', 'happy', 'happiness', 'shanti'],
  },
  {
    id: 'desire-attachment',
    label: 'Desire and attachment',
    keywords: ['desire', 'want', 'craving', 'greed', 'attached', 'attachment', 'addiction', 'addicted', 'lust', 'temptation', 'money', 'wealth', 'jealous', 'jealousy', 'envy', 'breakup'],
  },
  {
    id: 'mind-discipline',
    label: 'Mastering the mind',
    keywords: ['mind', 'thoughts', 'overthinking', 'focus', 'concentrate', 'distracted', 'meditation', 'meditate', 'discipline', 'control', 'habit'],
  },
  {
    id: 'self-soul',
    label: 'The self and the soul',
    keywords: ['soul', 'self', 'atman', 'eternal', 'who am i', 'identity', 'body'],
  },
  {
    id: 'guilt-redemption',
    label: 'Guilt and redemption',
    keywords: ['guilt', 'guilty', 'regret', 'mistake', 'mistakes', 'sin', 'shame', 'ashamed', 'forgive', 'forgiveness', 'wrong'],
  },
  {
    id: 'courage-self-worth',
    label: 'Courage and self-worth',
    keywords: ['weak', 'weakness', 'worthless', 'useless', 'confidence', 'courage', 'brave', 'give up', 'quit', 'insecure', 'self-esteem', 'failure'],
  },
  {
    id: 'relationships-family',
    label: 'Relationships and family',
    keywords: ['family', 'parents', 'father', 'mother', 'brother', 'sister', 'wife', 'husband', 'friend', 'friends', 'relationship', 'marriage', 'partner', 'children', 'son', 'daughter', 'enemy'],
  },
  {
    id: 'ego-pride',
    label: 'Ego and pride',
    keywords: ['ego', 'pride', 'proud', 'arrogant', 'arrogance', 'respect', 'humble', 'humility', 'status'],
  },
  {
    id: 'selfless-service',
    label: 'Selfless service',
    keywords: ['help', 'helping', 'serve', 'service', 'others', 'charity', 'give', 'giving', 'kindness', 'compassion'],
  },
  {
    id: 'purpose-own-path',
    label: 'Purpose and one\'s own path',
    keywords: ['purpose', 'meaning', 'meaningless', 'career', 'path', 'calling', 'passion', 'compare', 'comparison', 'dharma', 'why'],
  },
  {
    id: 'wisdom-knowledge',
    label: 'Wisdom and knowledge',
    keywords: ['wisdom', 'knowledge', 'learn', 'learning', 'truth', 'understand', 'study', 'teacher', 'guru'],
  },
  {
    id: 'divine-nature',
    label: 'The nature of the divine',
    keywords: ['divine', 'god', 'universe', 'creation', 'supreme', 'brahman'],
  },
  {
    id: 'virtue-character',
    label: 'Virtue and character',
    keywords: ['honest', 'honesty', 'good', 'evil', 'character', 'virtue', 'moral', 'ethics', 'lie', 'lying', 'cruel'],
  },
  {
    id: 'lifestyle-balance',
    label: 'Daily life and balance',
    keywords: ['sleep', 'food', 'eat', 'eating', 'diet', 'routine', 'health', 'tired', 'exhausted', 'burnout', 'rest'],
  },
  {
    id: 'narrative',
    label: 'Story and setting',
    keywords: [],
  },
];

export const THEME_IDS = new Set<string>(THEMES.map((theme) => theme.id));

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && THEME_IDS.has(value);
}

export function themeLabel(id: string): string {
  return THEMES.find((theme) => theme.id === id)?.label ?? id;
}

/** Themes whose everyday words appear in the text. Used when the model cannot tag the message. */
export function themesFromText(text: string): ThemeId[] {
  const lower = ` ${text.toLowerCase().replace(/[^a-z' -]+/g, ' ')} `;
  const found: ThemeId[] = [];
  for (const theme of THEMES) {
    if (theme.keywords.some((word) => lower.includes(` ${word} `) || lower.includes(` ${word}s `) || lower.includes(` ${word}ed `) || lower.includes(` ${word}ing `))) {
      found.push(theme.id);
    }
  }
  return found;
}
