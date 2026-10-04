import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { isThemeId, type ThemeId } from './themes';

export type EnrichedVerse = {
  summary: string;
  themes: ThemeId[];
  situations: string[];
  notFor: string[];
  /** False when the verse only narrates the scene or voices Arjuna's despair. */
  teaching: boolean;
};

export function enrichedPath(): string {
  return path.join(process.cwd(), 'verse-enriched.json');
}

function stringList(value: unknown, max: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.replace(/\s+/g, ' ').trim())
    .filter((item) => item.length > 0 && item.length <= maxLength)
    .slice(0, max);
}

/** Returns null when the record is unusable, so the verse is enriched again on the next run. */
export function cleanEnriched(value: unknown): EnrichedVerse | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const summary = typeof record.summary === 'string' ? record.summary.replace(/\s+/g, ' ').trim() : '';
  if (summary.length < 15 || summary.length > 500 || /[ऀ-ॿ]/.test(summary)) return null;
  const themes = [...new Set(Array.isArray(record.themes) ? record.themes.filter(isThemeId) : [])].slice(0, 3);
  if (themes.length === 0) return null;
  const teaching = record.teaching !== false && !(themes.length === 1 && themes[0] === 'narrative');
  return {
    summary,
    themes,
    situations: stringList(record.situations, 5, 160),
    notFor: stringList(record.notFor, 3, 160),
    teaching,
  };
}

let cached: Map<string, EnrichedVerse> | null = null;

export function loadEnriched(): Map<string, EnrichedVerse> {
  if (cached) return cached;
  const map = new Map<string, EnrichedVerse>();
  const file = enrichedPath();
  if (existsSync(file)) {
    const data = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
    for (const [ref, value] of Object.entries(data)) {
      const clean = cleanEnriched(value);
      if (clean) map.set(ref, clean);
    }
  }
  cached = map;
  return map;
}
