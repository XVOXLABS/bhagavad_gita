const CRISIS_PATTERNS: RegExp[] = [
  /\bsuicid(e|al)\b/i,
  /\bkill(ing)? myself\b/i,
  /\bend (it all|my life)\b/i,
  /\b(want|wanna|wish) to die\b/i,
  /\bdon'?t want to (live|be alive|exist)\b/i,
  /\bno (reason|point) (to|in) (live|living)\b/i,
  /\bself[- ]?harm\b/i,
  /\b(cut|cutting|hurt|hurting) myself\b/i,
  /\bbetter off (dead|without me)\b/i,
  /\b(aatmahatya|atmahatya|khudkushi)\b/i,
  /\bmar(na|ne) (chahta|chahti|ka man)\b/i,
  /\bjeena nahi\b/i,
  /\b(saaganum|sethudalam|sethuduven|sethu poga)\b/i,
  /தற்கொலை|आत्महत्या|खुदकुशी/,
];

export function mentionsCrisis(message: string): boolean {
  return CRISIS_PATTERNS.some((pattern) => pattern.test(message));
}

export type Helpline = { name: string; number: string; note: string };

export const HELPLINES: Helpline[] = [
  { name: 'Tele-MANAS (India)', number: '14416', note: 'Free, 24/7, many Indian languages. Also 1-800-891-4416.' },
  { name: 'Emergency (India)', number: '112', note: 'If you are in immediate danger.' },
];

export const CRISIS_MESSAGE =
  'You matter, and you do not have to carry this alone. Please talk to someone right now: a person you trust, or a trained counsellor on a helpline. Outside India, please call your local emergency number.';
