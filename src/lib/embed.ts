import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const JINA_URL = 'https://api.jina.ai/v1/embeddings';
export const EMBED_DIMS = 1024;

export type EmbedTask = 'retrieval.query' | 'retrieval.passage';

export function embedModel(): string {
  return process.env.JINA_EMBED_MODEL?.trim() || 'jina-embeddings-v4';
}

export function vectorsPath(): string {
  return path.join(process.cwd(), 'verse-embeddings.json');
}

export function normalize(values: ArrayLike<number>): Float32Array {
  const out = Float32Array.from(values);
  let sum = 0;
  for (const value of out) sum += value * value;
  const norm = Math.sqrt(sum) || 1;
  for (let i = 0; i < out.length; i += 1) out[i] /= norm;
  return out;
}

/** Vectors are normalized, so the dot product is the cosine similarity. */
export function dot(a: Float32Array, b: Float32Array): number {
  const length = Math.min(a.length, b.length);
  let sum = 0;
  for (let i = 0; i < length; i += 1) sum += a[i] * b[i];
  return sum;
}

export function redactJina(message: string): string {
  return message.replace(/jina_[A-Za-z0-9_-]+/g, '[redacted]');
}

type JinaResponse = {
  data?: { index: number; embedding: number[] }[];
  usage?: { total_tokens?: number };
  detail?: string;
};

export async function jinaEmbed(
  texts: string[],
  task: EmbedTask,
  options: { timeoutMs?: number; model?: string } = {},
): Promise<{ vectors: Float32Array[]; tokens: number }> {
  const apiKey = process.env.JINA_API_KEY?.trim();
  if (!apiKey) throw new Error('JINA_API_KEY is not set');
  const response = await fetch(JINA_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: options.model ?? embedModel(),
      task,
      dimensions: EMBED_DIMS,
      input: texts.map((text) => ({ text })),
    }),
    signal: AbortSignal.timeout(options.timeoutMs ?? 30_000),
  });
  const body = (await response.json().catch(() => ({}))) as JinaResponse;
  if (!response.ok || !Array.isArray(body.data)) {
    throw new Error(redactJina(`Jina ${response.status}: ${body.detail ?? 'embedding request failed'}`).slice(0, 300));
  }
  const vectors = [...body.data].sort((a, b) => a.index - b.index).map((item) => normalize(item.embedding));
  if (vectors.length !== texts.length) throw new Error('Jina returned the wrong number of vectors');
  return { vectors, tokens: body.usage?.total_tokens ?? 0 };
}

export type VerseVectors = {
  model: string;
  dims: number;
  vectors: Map<string, Float32Array>;
};

type VectorFile = { model: string; task: string; dims: number; refs: string[]; data: string };

let verseVectors: VerseVectors | null | undefined;

export function loadVerseVectors(): VerseVectors | null {
  if (verseVectors !== undefined) return verseVectors;
  const file = vectorsPath();
  if (!existsSync(file)) {
    verseVectors = null;
    return null;
  }
  const parsed = JSON.parse(readFileSync(file, 'utf8')) as VectorFile;
  const bytes = Buffer.from(parsed.data, 'base64');
  const all = new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  const vectors = new Map<string, Float32Array>();
  parsed.refs.forEach((ref, index) => {
    vectors.set(ref, all.subarray(index * parsed.dims, (index + 1) * parsed.dims));
  });
  verseVectors = { model: parsed.model, dims: parsed.dims, vectors };
  return verseVectors;
}

export function encodeVectorFile(model: string, refs: string[], vectors: Float32Array[]): string {
  const all = new Float32Array(refs.length * EMBED_DIMS);
  vectors.forEach((vector, index) => all.set(vector.subarray(0, EMBED_DIMS), index * EMBED_DIMS));
  const file: VectorFile = {
    model,
    task: 'retrieval.passage',
    dims: EMBED_DIMS,
    refs,
    data: Buffer.from(all.buffer).toString('base64'),
  };
  return JSON.stringify(file);
}

const queryCache = new Map<string, Float32Array>();
const QUERY_CACHE_SIZE = 200;
let warned = false;

function warnOnce(detail: string): void {
  if (warned) return;
  warned = true;
  console.info(JSON.stringify({ event: 'embedding_unavailable', detail }));
}

/** Embeds the user's words for search. Returns null whenever semantic search cannot run, so callers fall back to keywords. */
export async function embedQuery(text: string): Promise<Float32Array | null> {
  const stored = loadVerseVectors();
  if (!stored) {
    warnOnce('verse-embeddings.json is missing; run scripts/embed-verses.ts');
    return null;
  }
  if (stored.model !== embedModel() || stored.dims !== EMBED_DIMS) {
    warnOnce(`verse vectors were made with ${stored.model}/${stored.dims}; re-run scripts/embed-verses.ts`);
    return null;
  }
  if (!process.env.JINA_API_KEY?.trim()) {
    warnOnce('JINA_API_KEY is not set');
    return null;
  }
  const key = text.trim();
  const hit = queryCache.get(key);
  if (hit) {
    queryCache.delete(key);
    queryCache.set(key, hit);
    return hit;
  }
  try {
    const { vectors } = await jinaEmbed([key], 'retrieval.query', { timeoutMs: 8_000 });
    const vector = vectors[0];
    queryCache.set(key, vector);
    if (queryCache.size > QUERY_CACHE_SIZE) queryCache.delete(queryCache.keys().next().value as string);
    return vector;
  } catch (error) {
    console.info(JSON.stringify({ event: 'embedding_failed', detail: redactJina(error instanceof Error ? error.message : 'failed') }));
    return null;
  }
}
