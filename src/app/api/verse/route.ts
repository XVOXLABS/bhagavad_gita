import { loadCorpus, toDisplay, verseKey } from '@/lib/corpus';

export const runtime = 'nodejs';

/** One stored verse by chapter and verse number. The text comes from the corpus only. */
export function GET(request: Request): Response {
  const params = new URL(request.url).searchParams;
  const chapter = Number(params.get('chapter'));
  const verse = Number(params.get('verse'));
  if (!Number.isInteger(chapter) || !Number.isInteger(verse)) {
    return Response.json({ error: 'Chapter and verse must be numbers.' }, { status: 400 });
  }
  const found = loadCorpus().verses.get(verseKey(chapter, verse));
  if (!found) return Response.json({ error: 'No such verse.' }, { status: 404 });
  return Response.json({ verse: toDisplay(found) });
}
