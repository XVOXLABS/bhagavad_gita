/**
 * Quick Conversation Evaluation Script (AI Evals)
 * Tests 10 real-world Tamil & English scenarios end-to-end and prints Krishna's exact replies.
 *
 * Usage:
 *   npm run eval:chat
 */
import { loadEnvLocal } from './env';
import { respond } from '../src/lib/pipeline';
import { replyText } from '../src/lib/verify';

loadEnvLocal();

type Scenario = {
  id: string;
  label: string;
  message: string;
  previousLanguage?: string;
  expectVerse: boolean;
  expectLang: 'en' | 'ta';
  isStory?: boolean;
};

const SCENARIOS: Scenario[] = [
  {
    id: '1_vague_sad_en',
    label: 'Vague Sadness (English - Listen First)',
    message: 'Krishna, I feel very bad today',
    expectVerse: false,
    expectLang: 'en',
  },
  {
    id: '2_vague_sad_ta',
    label: 'Vague Sadness (Tamil - Listen First)',
    message: 'எனக்கு ஒரு மாதிரி கவலையா இருக்கு கிருஷ்ணா.',
    expectVerse: false,
    expectLang: 'ta',
  },
  {
    id: '3_lonely_ta',
    label: 'Feeling Lonely / No Friends (Tamil)',
    message: 'எனக்குத் தான் அந்த மாதிரி நல்ல friends யாருமே இல்லையே.',
    previousLanguage: 'ta',
    expectVerse: false,
    expectLang: 'ta',
  },
  {
    id: '4_story_ta',
    label: 'Funny Story Request (Tamil)',
    message: 'bore அடிக்குது, jolly ஆ சிரிக்கிற மாதிரி ஏதாவது ஒரு கதை சொல்லு கிருஷ்ணா.',
    previousLanguage: 'ta',
    expectVerse: false,
    expectLang: 'ta',
    isStory: true,
  },
  {
    id: '5_story_en',
    label: 'Fun Story Request (English)',
    message: 'Tell me a short fun story to cheer me up.',
    expectVerse: false,
    expectLang: 'en',
    isStory: true,
  },
  {
    id: '6_checkin_ta',
    label: 'Personal Check-in (Tamil)',
    message: 'சாப்பிட்டியா கிருஷ்ணா?',
    expectVerse: false,
    expectLang: 'ta',
  },
  {
    id: '7_ack_ta',
    label: 'Acknowledgment (Okay கிருஷ்ணா)',
    message: 'Okay கிருஷ்ணா, நீ சொல்ற மாதிரி பண்றேன்.',
    previousLanguage: 'en',
    expectVerse: false,
    expectLang: 'ta',
  },
  {
    id: '8_dilemma_ta',
    label: 'A vs B Travel/Duty Dilemma (Tamil)',
    message: 'என் friend என்னை கடலூருக்கு கூப்பிடுறான், ஆனா வீட்டுல நிறைய வேலை இருக்கு. எதைப் பார்க்கிறதுன்னே தெரியல, நீயே சொல்லு.',
    previousLanguage: 'ta',
    expectVerse: true,
    expectLang: 'ta',
  },
  {
    id: '9_betrayal_ta',
    label: 'Betrayal by Friends (Tamil)',
    message: 'என் friends எல்லாம் எனக்கு துரோகம் பண்ணிட்டாங்க, மனசு ரொம்ப வலிக்குது. என்ன பண்றது?',
    previousLanguage: 'ta',
    expectVerse: true,
    expectLang: 'ta',
  },
  {
    id: '10_work_stress_en',
    label: 'Work Stress & Fear (English)',
    message: "I am working so hard at my job, but I'm terrified I will fail my review.",
    expectVerse: true,
    expectLang: 'en',
  },
];

async function main(): Promise<void> {
  console.log('\n🪷 Running Krishna Conversation Eval (10 Scenarios)...\n');
  let passed = 0;

  for (const s of SCENARIOS) {
    const start = Date.now();
    const history = s.previousLanguage
      ? [{ role: 'assistant' as const, content: '...', language: s.previousLanguage }]
      : [];

    try {
      const res = await respond(s.message, history);
      const ms = Date.now() - start;
      const text = replyText(res.reply);
      const words = text.trim().split(/\s+/).length;
      const hasVerse = res.verses.length > 0;
      const verseRefs = res.verses.map((v) => `${v.chapter}.${v.verse}`).join(', ');

      const warnings: string[] = [];
      if (hasVerse !== s.expectVerse) {
        warnings.push(`Expected verse=${s.expectVerse}, got ${hasVerse} (${verseRefs || 'none'})`);
      }
      if (res.language !== s.expectLang) {
        warnings.push(`Expected lang=${s.expectLang}, got ${res.language}`);
      }
      if (s.isStory && words < 20) {
        warnings.push(`Story too short (${words} words) - may have stalled!`);
      }
      if (/10 நிமிடங்கள்|ஆவணத்தை பகிர்வு|செய்தி அனுப்புதல்/.test(text)) {
        warnings.push('Cliché "10 minutes / share document" detected!');
      }
      if (text.startsWith('நான் உன்னுடன் இருக்கிறேன், நண்பா')) {
        warnings.push('Repetitive Tamil opener detected!');
      }

      if (warnings.length === 0) passed += 1;

      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`[${warnings.length === 0 ? '✅ PASS' : '⚠️ WARN'}] ${s.label} (${ms}ms | ${words} words)`);
      console.log(`User:    ${s.message}`);
      console.log(`Intent:  ${res.debug.situation.intent} | Lang: ${res.language}${verseRefs ? ` | Verse: Gita ${verseRefs}` : ''}`);
      console.log(`Krishna: ${text.replace(/\n+/g, ' / ')}`);
      if (warnings.length > 0) {
        console.log(`Issues:  ${warnings.join(' | ')}`);
      }
    } catch (err) {
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`[❌ ERR] ${s.label}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`Done: ${passed}/${SCENARIOS.length} scenarios passed all checks.\n`);
}

void main();
