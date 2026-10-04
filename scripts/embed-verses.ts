/**
 * Embeds every verse (summary, themes, situations, translation) with Jina and writes verse-embeddings.json.
 * Re-run after verse-enriched.json changes or after changing JINA_EMBED_MODEL.
 *
 *   npx tsx scripts/embed-verses.ts
 */
import { renameSync, writeFileSync } from 'node:fs';
import { loadEnvLocal } from './env';
import { loadCorpus, type CorpusVerse } from '../src/lib/corpus';
import { embedModel, encodeVectorFile, jinaEmbed, vectorsPath } from '../src/lib/embed';
import { themeLabel } from '../src/lib/themes';

loadEnvLocal();

const BATCH_SIZE = 64;

function passageText(verse: CorpusVerse): string {
  const lines: string[] = [];
  if (verse.summary) lines.push(`Meaning: ${verse.summary}`);
  const themes = verse.verseThemes.filter((theme) => theme !== 'narrative');
  if (themes.length > 0) lines.push(`Themes: ${themes.map(themeLabel).join(', ')}`);
  if (verse.situations.length > 0) lines.push(`Helps when: ${verse.situations.join('; ')}`);
  if (verse.englishTranslation) lines.push(`Verse: ${verse.englishTranslation}`);
  return lines.join('\n');
}

async function main(): Promise<void> {
  const model = embedModel();
  const verses = [...loadCorpus().verses.values()].sort((a, b) => a.id - b.id);
  const missing = verses.filter((verse) => !verse.summary).length;
  if (missing > 0) {
    console.warn(JSON.stringify({ event: 'embed_warning', detail: `${missing} verses have no enrichment yet; they are embedded from the translation only.` }));
  }

  const refs = verses.map((verse) => `${verse.chapter}.${verse.verse}`);
  const vectors: Float32Array[] = [];
  let tokens = 0;
  for (let start = 0; start < verses.length; start += BATCH_SIZE) {
    const batch = verses.slice(start, start + BATCH_SIZE);
    const result = await jinaEmbed(batch.map(passageText), 'retrieval.passage', { model, timeoutMs: 120_000 });
    vectors.push(...result.vectors);
    tokens += result.tokens;
    console.info(JSON.stringify({ event: 'embed_batch', done: vectors.length, total: verses.length }));
  }

  const file = vectorsPath();
  writeFileSync(`${file}.tmp`, encodeVectorFile(model, refs, vectors));
  renameSync(`${file}.tmp`, file);
  console.info(JSON.stringify({ event: 'embed_done', model, verses: refs.length, tokens }));
}

main().catch((error: unknown) => {
  console.error(JSON.stringify({ event: 'embed_failed', detail: error instanceof Error ? error.message : String(error) }));
  process.exitCode = 1;
});
