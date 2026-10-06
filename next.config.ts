import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  serverExternalPackages: ['openai'],
  // The chat route reads these with fs at runtime; tracing does not see them on its own.
  outputFileTracingIncludes: {
    '/api/chat': ['./verse.json', './Bhagwad_Gita.csv', './verse-enriched.json', './verse-embeddings.json'],
  },
};

export default nextConfig;
