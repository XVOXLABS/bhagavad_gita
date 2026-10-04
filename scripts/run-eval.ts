/**
 * Measures verse accuracy against the golden set.
 *
 *   npm run eval                       # full: situation -> search -> verse choice
 *   npm run eval -- --retrieval        # search only (recall@5 / recall@18), no choice call
 *   npm run eval -- --keyword          # force keyword search, to compare with semantic
 *   npm run eval -- --raw              # skip the situation step and search with the raw message
 *   npm run eval -- --limit 10 | --only grief-father,alone
 */
import { loadEnvLocal } from './env';
import { loadCorpus } from '../src/lib/corpus';
import { embedQuery } from '../src/lib/embed';
import { GOLDEN_SET } from '../src/lib/eval/golden-set';
import { extractSituation, safeErrorMessage, selectVerses } from '../src/lib/llm';
import { buildShortlist, queryText } from '../src/lib/retrieve';
import { evaluateSelection, fallbackSituation, parseSelection, parseSituation } from '../src/lib/verify';

loadEnvLocal();

const flags = new Set(process.argv.slice(2));
function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function withRetry<T>(work: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await work();
    } catch (error) {
      const status = (error as { status?: number }).status;
      if (status !== 429 || attempt >= 8) throw error;
      await new Promise((resolve) => setTimeout(resolve, 15_000 * attempt));
    }
  }
}

async function main(): Promise<void> {
  const corpus = loadCorpus();
  const only = arg('--only')?.split(',');
  const cases = GOLDEN_SET.filter((item) => !only || only.includes(item.id)).slice(0, Number(arg('--limit') ?? Infinity));

  for (const item of cases) {
    const unknown = item.acceptable.filter((ref) => !corpus.verses.has(ref));
    if (unknown.length > 0) console.warn(`[${item.id}] acceptable refs not in corpus: ${unknown.join(', ')}`);
  }

  let at5 = 0;
  let at18 = 0;
  let top1 = 0;
  let noMatch = 0;
  let semanticCases = 0;

  for (const item of cases) {
    const acceptable = new Set(item.acceptable);
    const situation = flags.has('--raw')
      ? fallbackSituation(item.message)
      : parseSituation(await withRetry(() => extractSituation(item.message, [])), item.message);
    const vector = flags.has('--keyword') ? null : await embedQuery(queryText(item.message, situation));
    const shortlist = buildShortlist({ message: item.message, situation, queryVector: vector });
    if (shortlist.mode === 'semantic') semanticCases += 1;

    const hit5 = shortlist.refs.slice(0, 5).some((ref) => acceptable.has(ref));
    const hit18 = shortlist.refs.some((ref) => acceptable.has(ref));
    if (hit5) at5 += 1;
    if (hit18) at18 += 1;

    let chosen = '-';
    let correct = false;
    if (!flags.has('--retrieval')) {
      try {
        const parsed = parseSelection(await withRetry(() => selectVerses(item.message, situation, shortlist, [])));
        const result = parsed ? evaluateSelection(parsed, shortlist.refs) : null;
        if (!result || result.status !== 'answered') {
          noMatch += 1;
          chosen = 'no match';
        } else {
          const refs = result.verses.map((verse) => `${verse.chapter}.${verse.verse}`);
          chosen = refs.join('+');
          correct = acceptable.has(refs[0]);
          if (correct) top1 += 1;
        }
      } catch (error) {
        chosen = `error: ${safeErrorMessage(error)}`;
      }
    }

    console.info(
      `${correct ? 'PASS' : flags.has('--retrieval') ? (hit18 ? 'HIT ' : 'MISS') : 'FAIL'}  ${item.id.padEnd(24)} chose ${chosen.padEnd(10)} @5 ${hit5 ? 'y' : 'n'}  @18 ${hit18 ? 'y' : 'n'}  [${shortlist.mode}] top: ${shortlist.refs.slice(0, 5).join(' ')}`,
    );
  }

  const n = cases.length;
  const pct = (value: number) => `${((100 * value) / Math.max(n, 1)).toFixed(1)}%`;
  console.info('\n' + '-'.repeat(60));
  console.info(`cases           ${n}  (semantic search used in ${semanticCases})`);
  console.info(`recall@5        ${pct(at5)}`);
  console.info(`recall@18       ${pct(at18)}`);
  if (!flags.has('--retrieval')) {
    console.info(`top-1 accuracy  ${pct(top1)}`);
    console.info(`no strong match ${noMatch}`);
  }
}

main().catch((error: unknown) => {
  console.error(safeErrorMessage(error));
  process.exitCode = 1;
});
