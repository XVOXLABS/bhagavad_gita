import { type CorpusVerse, loadCorpus, verseKey } from './corpus';
import { dot, loadVerseVectors, type VerseVectors } from './embed';
import { themeLabel, themesFromText, type ThemeId } from './themes';

/** Groq on-demand tier rejects requests far above ~8k input tokens. */
export const SHORTLIST_SIZE = 18;
const MAX_PINNED = 3;

const THEME_BONUS = 0.04;
const KEYWORD_BONUS = 0.005;
const NOT_TEACHING_PENALTY = 0.05;

const STOP = new Set([
  'about', 'after', 'also', 'and', 'are', 'been', 'being', 'but', 'can', 'could', 'did', 'does', 'doing',
  'feel', 'felt', 'for', 'from', 'had', 'has', 'have', 'hey', 'how', 'just', 'now', 'our', 'she', 'that',
  'the', 'their', 'them', 'then', 'there', 'they', 'this', 'too', 'very', 'was', 'were', 'what', 'when',
  'where', 'which', 'while', 'who', 'why', 'will', 'with', 'you', 'your', 'feeling', 'person', 'wants',
]);

/** Extra gloss terms to try when the user uses everyday words. */
const QUERY_GROUPS: string[][] = [
  ['fear', 'afraid', 'fright', 'anxiety', 'terror', 'dread', 'worry'],
  ['stress', 'stressed', 'overwhelmed', 'pressure', 'burden', 'trouble'],
  ['grief', 'sorrow', 'loss', 'mourn', 'sad', 'sadness'],
  ['anger', 'angry', 'rage', 'wrath', 'resent'],
  ['confusion', 'confused', 'doubt', 'uncertain', 'lost'],
  ['work', 'job', 'duty', 'action', 'karma', 'deed', 'task'],
  ['future', 'tomorrow', 'death', 'die', 'dying', 'time'],
  ['peace', 'calm', 'quiet', 'still', 'rest'],
  ['mind', 'thought', 'desire', 'attachment', 'cling'],
  ['refuge', 'protect', 'surrender', 'devotion', 'trust'],
  ['self', 'soul', 'eternal', 'immortal'],
  ['financial', 'finance', 'money', 'wealth', 'riches'],
];

/** What the message is. Only `problem` and `follow_up` get a verse. */
export type Intent =
  | 'problem'
  | 'follow_up'
  | 'greeting'
  | 'about_me'
  | 'language_request'
  | 'unclear'
  | 'off_topic'
  | 'harmful';

export type Situation = {
  intent: Intent;
  /** ISO 639-1 code of the language Krishna should reply in. */
  replyLanguage: string;
  emotions: string[];
  situation: string;
  need: string;
  themes: ThemeId[];
  crisis: boolean;
  /** True when this message continues the previous topic rather than raising a new one. */
  continuesPrevious: boolean;
};

export type ShortlistInput = {
  message: string;
  situation?: Situation | null;
  queryVector?: Float32Array | null;
  pinnedRefs?: string[];
  /** Injected in tests; defaults to verse-embeddings.json. */
  vectors?: VerseVectors | null;
};

export type ScoredVerse = { ref: string; score: number };

export type Shortlist = {
  refs: string[];
  document: string;
  terms: string[];
  mode: 'semantic' | 'keyword';
};

export function expandQueryTerms(text: string): string[] {
  const raw = text.toLowerCase().match(/[a-z']{3,}/g) ?? [];
  const terms = new Set<string>();
  for (const word of raw) {
    if (STOP.has(word)) continue;
    terms.add(word);
    for (const group of QUERY_GROUPS) {
      if (group.some((item) => item === word || word.includes(item) || item.includes(word))) {
        for (const item of group) terms.add(item);
      }
    }
  }
  return [...terms];
}

function textTokens(text: string): Set<string> {
  return new Set(text.toLowerCase().match(/[a-z]+(?:-[a-z]+)*/g) ?? []);
}

function keywordScore(verse: CorpusVerse, terms: string[]): number {
  const tokens = textTokens([verse.englishTranslation ?? '', verse.summary ?? '', verse.situations.join(' ')].join(' '));
  if (tokens.size === 0) return 0;
  let score = 0;
  for (const term of terms) {
    const hit = [...tokens].some((token) => token === term || (term.length >= 5 && token.startsWith(term)));
    if (hit) score += term.length >= 6 ? 2 : 1;
  }
  return score;
}

export function queryText(message: string, situation?: Situation | null): string {
  if (!situation) return message;
  const parts = [message];
  if (situation.situation) parts.push(`Situation: ${situation.situation}`);
  if (situation.emotions.length > 0) parts.push(`Feeling: ${situation.emotions.join(', ')}`);
  if (situation.need) parts.push(`Needs: ${situation.need}`);
  return parts.join('\n');
}

function isNarrativeOnly(verse: CorpusVerse): boolean {
  return verse.verseThemes.length === 1 && verse.verseThemes[0] === 'narrative';
}

/** Ranks every verse. Semantic similarity leads when vectors exist; themes and keywords refine it. */
export function rankVerses(input: ShortlistInput): { ranked: ScoredVerse[]; terms: string[]; mode: Shortlist['mode'] } {
  const corpus = loadCorpus();
  const terms = expandQueryTerms(queryText(input.message, input.situation));
  const queryThemes = new Set<string>(
    input.situation?.themes.length ? input.situation.themes : themesFromText(input.message),
  );
  const stored = input.vectors === undefined ? loadVerseVectors() : input.vectors;
  const semantic = Boolean(input.queryVector && stored);

  const ranked: ScoredVerse[] = [];
  for (const verse of corpus.verses.values()) {
    if (isNarrativeOnly(verse)) continue;
    const ref = verseKey(verse.chapter, verse.verse);
    const themeHits = Math.min(2, verse.verseThemes.filter((theme) => queryThemes.has(theme)).length);
    const keywords = keywordScore(verse, terms);
    let score: number;
    if (semantic) {
      const vector = stored!.vectors.get(ref);
      if (!vector) continue;
      score = dot(input.queryVector!, vector) + themeHits * THEME_BONUS + Math.min(keywords, 6) * KEYWORD_BONUS;
      if (!verse.teaching) score -= NOT_TEACHING_PENALTY;
    } else {
      score = themeHits * 3 + keywords;
      if (score <= 0) continue;
      if (!verse.teaching) score -= 1;
    }
    ranked.push({ ref, score });
  }

  const order = new Map([...corpus.verses.values()].map((verse) => [verseKey(verse.chapter, verse.verse), verse.id]));
  ranked.sort((a, b) => b.score - a.score || (order.get(a.ref) ?? 0) - (order.get(b.ref) ?? 0));
  return { ranked, terms, mode: semantic ? 'semantic' : 'keyword' };
}

function formatBlock(verse: CorpusVerse): string {
  const lines = [verseKey(verse.chapter, verse.verse)];
  if (verse.summary) lines.push(`Meaning: ${verse.summary}`);
  const themes = verse.verseThemes.filter((theme) => theme !== 'narrative');
  if (themes.length > 0) lines.push(`Themes: ${themes.map(themeLabel).join(', ')}`);
  if (verse.situations.length > 0) lines.push(`Helps when: ${verse.situations.join('; ')}`);
  if (verse.notFor.length > 0) lines.push(`Not for: ${verse.notFor.join('; ')}`);
  if (!verse.teaching) lines.push('Note: Arjuna voicing his struggle, not a teaching.');
  if (verse.englishTranslation) lines.push(`Translation: ${verse.englishTranslation}`);
  return lines.join('\n');
}

/** Picks the verses the model may choose from. Earlier citations are kept so follow-ups can stay on them. */
export function buildShortlist(input: ShortlistInput): Shortlist {
  const corpus = loadCorpus();
  const { ranked, terms, mode } = rankVerses(input);
  const chosen: CorpusVerse[] = [];
  const seen = new Set<string>();

  for (const ref of (input.pinnedRefs ?? []).slice(-MAX_PINNED)) {
    const found = corpus.verses.get(ref);
    if (found && !seen.has(ref)) {
      chosen.push(found);
      seen.add(ref);
    }
  }
  for (const { ref } of ranked) {
    if (chosen.length >= SHORTLIST_SIZE) break;
    if (seen.has(ref)) continue;
    const verse = corpus.verses.get(ref);
    if (!verse) continue;
    chosen.push(verse);
    seen.add(ref);
  }

  return {
    refs: chosen.map((verse) => verseKey(verse.chapter, verse.verse)),
    terms,
    mode,
    document: chosen.map(formatBlock).join('\n---\n'),
  };
}
