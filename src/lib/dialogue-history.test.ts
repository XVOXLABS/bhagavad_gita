import assert from 'node:assert/strict';
import test from 'node:test';
import {
  generateDialogueTitle,
  formatDialogueDate,
  type DialogueMessage,
  type DialogueSession,
} from './dialogue-history';

test('generateDialogueTitle creates title from first user message', () => {
  const messages: DialogueMessage[] = [
    {
      id: '1',
      role: 'user',
      text: 'How can I overcome anxiety at work?',
      timestamp: Date.now(),
    },
    {
      id: '2',
      role: 'assistant',
      text: 'Perform your duty with calm mind.',
      timestamp: Date.now(),
    },
  ];

  const title = generateDialogueTitle(messages);
  assert.equal(title, 'How can I overcome anxiety at work?');
});

test('generateDialogueTitle appends cited verse when present', () => {
  const messages: DialogueMessage[] = [
    {
      id: '1',
      role: 'user',
      text: 'Tell me about detachment from results',
      timestamp: Date.now(),
    },
    {
      id: '2',
      role: 'assistant',
      text: 'You have a right to your duty.',
      verses: [
        {
          chapter: 2,
          verse: 47,
          sanskrit: 'karmaṇy evādhikāras te',
          englishTranslation: 'You have a right to perform your duty...',
          hindiMeaning: '',
          wordMeanings: '',
          transliteration: '',
          summary: '',
          verseThemes: [],
          themes: [],
        },
      ],
      timestamp: Date.now(),
    },
  ];

  const title = generateDialogueTitle(messages);
  assert.equal(title, 'Tell me about detachment from results (Gita 2.47)');
});

test('generateDialogueTitle truncates overly long user messages gracefully', () => {
  const messages: DialogueMessage[] = [
    {
      id: '1',
      role: 'user',
      text: 'I have been thinking a lot about the difficult challenges in my personal relationships and career',
      timestamp: Date.now(),
    },
  ];

  const title = generateDialogueTitle(messages);
  assert.ok(title.length <= 42);
  assert.ok(title.endsWith('…'));
});

test('generateDialogueTitle falls back gracefully when user text is empty', () => {
  const messages: DialogueMessage[] = [];
  const title = generateDialogueTitle(messages);
  assert.equal(title, 'Dialogue with Krishna');
});

test('formatDialogueDate handles today properly', () => {
  const now = Date.now();
  const formatted = formatDialogueDate(now);
  assert.ok(formatted.startsWith('Today at '));
});
