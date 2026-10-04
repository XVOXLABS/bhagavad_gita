import assert from 'node:assert/strict';
import test from 'node:test';
import { detectLanguage, isLanguage, languageName } from './language';

test('the typed script decides the language; romanised text counts as English', () => {
  assert.equal(detectLanguage('நீ தமிழ்ல பேசு'), 'ta');
  assert.equal(detectLanguage('मुझे डर लगता है'), 'hi');
  assert.equal(detectLanguage('నాకు భయంగా ఉంది'), 'te');
  assert.equal(detectLanguage('mujhe dar lagta hai'), 'en');
  assert.equal(isLanguage('ta'), true);
  assert.equal(isLanguage('xx'), false);
  assert.equal(languageName('ta'), 'Tamil');
});
