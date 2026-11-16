import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultProfile, personaInstructions } from './profile';

test('personaInstructions formats instructions for Sakha with name', () => {
  const instructions = personaInstructions({
    preferredName: 'Mani',
    persona: 'sakha',
    lifeContext: 'seeking clarity on career decisions',
  });

  assert.ok(instructions.includes("The seeker's name is Mani."));
  assert.ok(instructions.includes('Speak as Sakha (Dearest Friend and Constant Companion).'));
  assert.ok(instructions.includes('Devotee\'s life context / focus: seeking clarity on career decisions.'));
});

test('personaInstructions formats Guru persona instructions', () => {
  const instructions = personaInstructions({
    preferredName: 'Arjun',
    persona: 'guru',
  });

  assert.ok(instructions.includes("The seeker's name is Arjun."));
  assert.ok(instructions.includes('Speak as Guru (Wise Spiritual Preceptor).'));
  assert.ok(instructions.includes('eternal Atman'));
});

test('personaInstructions formats Margadarshi persona instructions', () => {
  const instructions = personaInstructions({
    preferredName: 'Radha',
    persona: 'margadarshi',
  });

  assert.ok(instructions.includes("The seeker's name is Radha."));
  assert.ok(instructions.includes('Speak as Margadarshi (The Practical Charioteer and Action Guide).'));
  assert.ok(instructions.includes('duty (Swadharma)'));
});

test('personaInstructions returns empty string when no profile provided', () => {
  assert.equal(personaInstructions(null), '');
  assert.equal(personaInstructions(undefined), '');
});

test('defaultProfile provides safe defaults', () => {
  const def = defaultProfile();
  assert.equal(def.persona, 'sakha');
  assert.equal(def.preferredName, '');
  assert.equal(def.language, 'en');
});
