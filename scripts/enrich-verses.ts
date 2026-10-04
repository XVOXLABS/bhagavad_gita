/**
 * One-time enrichment: summary, per-verse themes, real-life situations, and misuses for every verse.
 * Resumable: verses already in verse-enriched.json are skipped unless listed with --only.
 *
 *   npx tsx scripts/enrich-verses.ts                 # enrich everything still missing
 *   npx tsx scripts/enrich-verses.ts --limit 12      # small trial run
 *   npx tsx scripts/enrich-verses.ts --only 2.47,2.20
 *
 * ENRICH_PROVIDER=openai uses OPENAI_API_KEY / OPENAI_MODEL instead of Groq.
 */
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import OpenAI from 'openai';
import { loadEnvLocal } from './env';
import { loadCorpus, type CorpusVerse } from '../src/lib/corpus';
import { cleanEnriched, enrichedPath, type EnrichedVerse } from '../src/lib/enrichment';
import { THEMES } from '../src/lib/themes';

loadEnvLocal();

const BATCH_SIZE = 12;

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function client(): { api: OpenAI; model: string } {
  if (process.env.ENRICH_PROVIDER === 'openai') {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) throw new Error('OPENAI_API_KEY is not set');
    return { api: new OpenAI({ apiKey, maxRetries: 6 }), model: process.env.ENRICH_MODEL || process.env.OPENAI_MODEL || 'gpt-4.1-mini' };
  }
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) throw new Error('GROQ_API_KEY is not set');
  return {
    api: new OpenAI({ apiKey, baseURL: 'https://api.groq.com/openai/v1', maxRetries: 6 }),
    model: process.env.ENRICH_MODEL || process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
  };
}

const SYSTEM = `You annotate verses of the Bhagavad Gita so that a counselling app can match a person's real problem to the right verse.

For each verse you receive its reference and an English translation. Use your knowledge of the Gita's context (who is speaking, what came before) to read it correctly, but describe only what this verse itself says.

Return one JSON object: { "verses": [ { "ref": "2.47", "summary": string, "themes": string[], "situations": string[], "notFor": string[], "teaching": boolean } ] } with one entry per input verse, same refs.

Fields:
- summary: 1-2 plain modern English sentences giving the meaning of the verse, as a caring teacher would explain it. No Sanskrit, no verse numbers, no "In this verse".
- themes: 1-3 ids from this list, most important first:
${THEMES.map((theme) => `  ${theme.id} — ${theme.label}`).join('\n')}
  Use "narrative" alone when the verse only describes the scene, names warriors, conches, or armies, or reports what someone did, and offers nothing a person could apply.
  Arjuna's own words of grief, confusion, fear, or pleading are NOT narrative: tag them with the feeling they express (e.g. confusion-doubt, grief-loss, relationships-family) and give situations of people who feel the same, with teaching false.
- situations: 3-5 short, concrete, modern real-life situations this verse genuinely helps with, written as the person would describe them (e.g. "anxious about exam results", "grieving a parent who died"). Empty for narrative verses.
- notFor: 0-3 situations where this verse is commonly but wrongly applied (e.g. a verse about doing work without craving results is not for someone grieving a death). Empty if none.
- teaching: true if the verse offers guidance or insight a person can apply to their life; false for narration and for verses that only voice Arjuna's despair or questions.`;

async function enrichBatch(api: OpenAI, model: string, batch: CorpusVerse[]): Promise<Map<string, EnrichedVerse>> {
  const input = batch
    .map((verse) => `${verse.chapter}.${verse.verse}\n${verse.englishTranslation ?? '(no translation)'}`)
    .join('\n---\n');
  const response = await api.chat.completions.create({
    model,
    temperature: 0.2,
    max_completion_tokens: 6000,
    response_format: { type: 'json_object' },
    ...(model.startsWith('openai/gpt-oss') ? { reasoning_effort: 'low' as const } : {}),
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: input },
    ],
  });
  const text = response.choices[0]?.message?.content ?? '';
  const out = new Map<string, EnrichedVerse>();
  let data: { verses?: unknown };
  try {
    data = JSON.parse(text) as { verses?: unknown };
  } catch {
    return out;
  }
  if (!Array.isArray(data.verses)) return out;
  const wanted = new Set(batch.map((verse) => `${verse.chapter}.${verse.verse}`));
  for (const item of data.verses) {
    const ref = typeof (item as { ref?: unknown })?.ref === 'string' ? (item as { ref: string }).ref.trim() : '';
    if (!wanted.has(ref)) continue;
    const clean = cleanEnriched(item);
    if (clean) out.set(ref, clean);
  }
  return out;
}

function save(ordered: CorpusVerse[], results: Record<string, EnrichedVerse>): void {
  const sorted: Record<string, EnrichedVerse> = {};
  for (const verse of ordered) {
    const ref = `${verse.chapter}.${verse.verse}`;
    if (results[ref]) sorted[ref] = results[ref];
  }
  const file = enrichedPath();
  writeFileSync(`${file}.tmp`, `${JSON.stringify(sorted, null, 1)}\n`);
  renameSync(`${file}.tmp`, file);
}

async function main(): Promise<void> {
  const { api, model } = client();
  const ordered = [...loadCorpus().verses.values()].sort((a, b) => a.id - b.id);
  const file = enrichedPath();
  const results: Record<string, EnrichedVerse> = existsSync(file)
    ? (JSON.parse(readFileSync(file, 'utf8')) as Record<string, EnrichedVerse>)
    : {};

  const only = arg('--only')?.split(',').map((ref) => ref.trim());
  const limit = Number(arg('--limit') ?? Infinity);
  let todo = ordered.filter((verse) => {
    const ref = `${verse.chapter}.${verse.verse}`;
    return only ? only.includes(ref) : !cleanEnriched(results[ref]);
  });
  todo = todo.slice(0, limit);
  console.info(JSON.stringify({ event: 'enrich_start', model, todo: todo.length, done: Object.keys(results).length }));

  for (let start = 0; start < todo.length; start += BATCH_SIZE) {
    const batch = todo.slice(start, start + BATCH_SIZE);
    let got: Map<string, EnrichedVerse>;
    try {
      got = await enrichBatch(api, model, batch);
    } catch (error) {
      save(ordered, results);
      const message = error instanceof Error ? error.message.slice(0, 300) : String(error);
      console.error(JSON.stringify({ event: 'enrich_stopped', reason: message, hint: 'Re-run the script later; finished verses are kept.' }));
      process.exitCode = 1;
      return;
    }
    for (const [ref, value] of got) results[ref] = value;
    save(ordered, results);
    const missed = batch.map((verse) => `${verse.chapter}.${verse.verse}`).filter((ref) => !got.has(ref));
    console.info(JSON.stringify({ event: 'enrich_batch', from: `${batch[0].chapter}.${batch[0].verse}`, ok: got.size, missed }));
  }

  const remaining = ordered.filter((verse) => !cleanEnriched(results[`${verse.chapter}.${verse.verse}`])).length;
  console.info(JSON.stringify({ event: 'enrich_done', enriched: ordered.length - remaining, remaining }));
}

void main();
