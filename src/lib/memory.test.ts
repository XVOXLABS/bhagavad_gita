import assert from 'node:assert/strict';
import test from 'node:test';
import { formatMemoriesForPrompt, mergeMemories, type CompanionMemory } from './memory';

test('formatMemoriesForPrompt formats active memories nicely', () => {
  const memories: CompanionMemory[] = [
    {
      id: 'm1',
      fact: 'Preparing for civil services exam and feeling overwhelmed',
      category: 'struggle',
      createdAt: Date.now(),
      active: true,
    },
    {
      id: 'm2',
      fact: 'Practicing 5 minutes of focused stillness',
      category: 'commitment',
      associatedVerse: '2.41',
      createdAt: Date.now(),
      active: true,
    },
    {
      id: 'm3',
      fact: 'Old resolved doubt',
      category: 'struggle',
      createdAt: Date.now(),
      active: false,
    },
  ];

  const prompt = formatMemoriesForPrompt(memories);
  assert.ok(prompt.includes('What you remember about this person from earlier conversations'));
  assert.ok(prompt.includes('- Preparing for civil services exam and feeling overwhelmed'));
  assert.ok(prompt.includes('- Practicing 5 minutes of focused stillness (related to Gita 2.41)'));
  assert.ok(!prompt.includes('Old resolved doubt')); // Inactive omitted
});

test('formatMemoriesForPrompt returns empty string when no memories', () => {
  assert.equal(formatMemoriesForPrompt([]), '');
  assert.equal(formatMemoriesForPrompt(null), '');
  assert.equal(formatMemoriesForPrompt(undefined), '');
});

test('mergeMemories deduplicates and prepends new memories', () => {
  const existing: CompanionMemory[] = [
    {
      id: '1',
      fact: 'Works as a software engineer in Bangalore',
      category: 'life_context',
      createdAt: 1000,
      active: true,
    },
  ];

  const incoming = [
    { fact: 'Works as a software engineer in Bangalore', category: 'life_context' as const }, // duplicate
    { fact: 'Has fear of failing in upcoming project presentation', category: 'struggle' as const },
  ];

  const merged = mergeMemories(existing, incoming);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].fact, 'Has fear of failing in upcoming project presentation');
  assert.equal(merged[1].fact, 'Works as a software engineer in Bangalore');
});
