import test from 'node:test';
import assert from 'node:assert/strict';
import { generatePersonalizedGreeting, KRISHNA_GREETING } from './greeting';
import type { DevoteeProfile } from './profile';
import type { CompanionMemory } from './memory';

test('returns default English greeting when no profile is given', () => {
  const result = generatePersonalizedGreeting(null, null);
  assert.equal(result.text, KRISHNA_GREETING);
  assert.equal(result.language, 'en');
  assert.equal(result.isPersonalized, false);
});

test('personalizes greeting with devotee name in Sakha persona', () => {
  const profile: DevoteeProfile = {
    preferredName: 'Mani',
    persona: 'sakha',
    lifeContext: 'Clarity',
    language: 'en',
  };
  const result = generatePersonalizedGreeting(profile, []);
  assert.equal(result.isPersonalized, true);
  assert.match(result.text, /Mani/);
  assert.match(result.text, /Radhe Radhe/);
});

test('personalizes greeting in Guru persona', () => {
  const profile: DevoteeProfile = {
    preferredName: 'Arjuna',
    persona: 'guru',
    lifeContext: 'Dharma',
    language: 'en',
  };
  const result = generatePersonalizedGreeting(profile, []);
  assert.equal(result.isPersonalized, true);
  assert.match(result.text, /Om Namo Bhagavate Vasudevaya/);
  assert.match(result.text, /Arjuna/);
});

test('personalizes greeting in Margadarshi persona', () => {
  const profile: DevoteeProfile = {
    preferredName: 'Devotee',
    persona: 'margadarshi',
    lifeContext: 'Career',
    language: 'en',
  };
  const result = generatePersonalizedGreeting(profile, []);
  assert.equal(result.isPersonalized, true);
  assert.match(result.text, /illuminate your path/);
  assert.match(result.text, /Devotee/);
});

test('personalizes greeting in Tamil when language is ta', () => {
  const profile: DevoteeProfile = {
    preferredName: 'மணி',
    persona: 'sakha',
    lifeContext: 'மன அமைதி',
    language: 'ta',
  };
  const result = generatePersonalizedGreeting(profile, []);
  assert.equal(result.isPersonalized, true);
  assert.equal(result.language, 'ta');
  assert.match(result.text, /ராதே ராதே, மணி!/);
});

test('personalizes greeting with active commitment recall', () => {
  const profile: DevoteeProfile = {
    preferredName: 'Mani',
    persona: 'sakha',
    lifeContext: 'Focus',
    language: 'en',
  };
  const memories: CompanionMemory[] = [
    {
      id: 'mem-1',
      fact: 'Practicing 5 minutes of focused contemplation on single priority',
      category: 'commitment',
      associatedVerse: '2.41',
      active: true,
      createdAt: Date.now(),
    },
  ];
  const result = generatePersonalizedGreeting(profile, memories);
  assert.equal(result.isPersonalized, true);
  assert.match(result.text, /Welcome back to our sacred sanctuary/);
  assert.match(result.text, /I remember our recent reflection/);
});
