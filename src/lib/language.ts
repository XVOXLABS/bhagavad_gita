export const LANGUAGES: Record<string, string> = {
  en: 'English',
  hi: 'Hindi',
  ta: 'Tamil',
  te: 'Telugu',
  kn: 'Kannada',
  ml: 'Malayalam',
  mr: 'Marathi',
  bn: 'Bengali',
  gu: 'Gujarati',
  pa: 'Punjabi',
};

/** Languages written in Devanagari, where Devanagari in a reply is normal text, not leaked Sanskrit. */
export const DEVANAGARI_LANGUAGES = new Set(['hi', 'mr']);

const SCRIPTS: [RegExp, string][] = [
  [/[஀-௿]/, 'ta'],
  [/[ఀ-౿]/, 'te'],
  [/[ಀ-೿]/, 'kn'],
  [/[ഀ-ൿ]/, 'ml'],
  [/[ঀ-৿]/, 'bn'],
  [/[઀-૿]/, 'gu'],
  [/[਀-੿]/, 'pa'],
  [/[ऀ-ॿ]/, 'hi'],
];

export function isLanguage(value: unknown): value is string {
  return typeof value === 'string' && value in LANGUAGES;
}

export function languageName(code: string): string {
  return LANGUAGES[code] ?? 'English';
}

/** The language of the script the person typed in. Romanised Hindi or Tamil reads as English. */
export function detectLanguage(text: string): string {
  for (const [pattern, code] of SCRIPTS) if (pattern.test(text)) return code;
  return 'en';
}
