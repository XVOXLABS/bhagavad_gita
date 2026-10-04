import assert from 'node:assert/strict';
import test from 'node:test';
import { mentionsCrisis } from './safety';

test('crisis words are caught in English, Hinglish, and Tamil', () => {
  for (const message of [
    'I want to die',
    'sometimes I think about suicide',
    'I keep hurting myself',
    'everyone would be better off without me',
    'mujhe aatmahatya karne ka man karta hai',
    'ab jeena nahi hai',
    'தற்கொலை பண்ணிக்கலாம்னு தோணுது',
  ]) {
    assert.equal(mentionsCrisis(message), true, message);
  }
});

test('ordinary pain is not flagged as a crisis', () => {
  for (const message of ['my grandfather died last week', 'this exam is killing me', 'I am scared of failing']) {
    assert.equal(mentionsCrisis(message), false, message);
  }
});
