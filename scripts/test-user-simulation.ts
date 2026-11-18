import { loadEnvLocal } from './env';
import { respond, type ChatResult } from '../src/lib/pipeline';
import type { SessionMessage } from '../src/lib/session';
import type { DevoteeProfile } from '../src/lib/profile';
import type { CompanionMemory } from '../src/lib/memory';
import { replyText } from '../src/lib/verify';

loadEnvLocal();

type TestCase = {
  name: string;
  profile: DevoteeProfile;
  memories?: CompanionMemory[];
  turns: string[];
};

const testCases: TestCase[] = [
  {
    name: 'Scenario 1: Casual Companion (Everyday Small Talk & Venting)',
    profile: { preferredName: 'Mani', persona: 'sakha', language: 'en' },
    turns: [
      'Hey Krishna, how are you doing today?',
      'I had such an exhausting day at work. My manager was irritated for no reason.',
      'Yeah, I just wanted to vent a bit. What are you up to right now?',
      'Haha, you are always so calm. Going to sleep now, goodnight Krishna!',
    ],
  },
  {
    name: 'Scenario 2: Real Grief & Deep Need for Gita Wisdom',
    profile: { preferredName: 'Arjun', persona: 'guru', language: 'en' },
    turns: [
      'Krishna, my grandfather passed away yesterday. I feel completely hollow and shattered inside.',
      'I know everyone dies, but how do I stop this overwhelming grief and numbness?',
    ],
  },
  {
    name: 'Scenario 3: Playful Devotion & Casual Friendship (Tamil / Tanglish)',
    profile: { preferredName: 'Kavitha', persona: 'sakha', language: 'ta' },
    turns: [
      'ஹாய் கிருஷ்ணா, சாப்பிட்டியா? என்ன பண்ற இப்போ?',
      'இன்னைக்கு ரொம்ப bore அடிக்குது, சும்மா ஏதாவது என்கிட்ட பேசுடா.',
      'சரி டா, நான் கிளம்புறேன். Bye bye!',
    ],
  },
  {
    name: 'Scenario 4: Work Dilemma & Action Guidance (Margadarshi Persona)',
    profile: { preferredName: 'Vikram', persona: 'margadarshi', language: 'en', lifeContext: 'Career & leadership' },
    turns: [
      'My teammate took all credit for my code during the executive review today. Should I confront him or stay silent?',
      'If I speak up, people will say I lack team spirit. If I stay silent, I lose my promotion. What is my Swadharma here?',
    ],
  },
];

async function runSimulation() {
  console.log('=== STARTING HUMAN-KRISHNA MULTI-CONVERSATION SIMULATION ===\n');

  for (const tc of testCases) {
    console.log(`\n============================================================`);
    console.log(`TEST: ${tc.name}`);
    console.log(`Profile: ${JSON.stringify(tc.profile)}`);
    console.log(`============================================================\n`);

    const history: SessionMessage[] = [];

    for (let i = 0; i < tc.turns.length; i++) {
      const userMsg = tc.turns[i];
      console.log(`--- [Turn ${i + 1}] User: "${userMsg}" ---`);

      try {
        const result: ChatResult = await respond(
          userMsg,
          history,
          undefined, // no live streaming needed for test
          tc.profile,
          tc.memories,
        );

        const replyContent = replyText(result.reply);
        console.log(`Status: ${result.status}`);
        console.log(`Intent detected: ${result.debug.situation.intent}`);
        console.log(`Verses cited: ${result.verses.map((v) => `${v.chapter}.${v.verse}`).join(', ') || 'None'}`);
        console.log(`Krishna Reply:\n${replyContent}\n`);

        // Append to history for the next turn
        history.push({ role: 'user', content: userMsg });
        history.push({
          role: 'assistant',
          content: replyContent,
          citations: result.verses.map((v) => `${v.chapter}.${v.verse}`),
        });
      } catch (err: any) {
        console.error(`Error on turn ${i + 1}:`, err.message);
      }
    }
  }

  console.log('\n=== SIMULATION COMPLETE ===');
}

runSimulation();
