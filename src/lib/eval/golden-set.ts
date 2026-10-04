/**
 * Realistic problems with the verses a Gita teacher would accept as a good answer.
 * Several verses can fit one feeling, so each case lists every acceptable ref.
 */
export type GoldenCase = { id: string; message: string; acceptable: string[] };

const GRIEF = ['2.11', '2.12', '2.13', '2.14', '2.20', '2.22', '2.23', '2.25', '2.27', '2.28', '2.30'];
const RESULTS = ['2.47', '2.48', '2.50', '2.38', '3.19', '5.10', '5.12', '2.71', '18.66', '6.5'];
const ANGER = ['2.62', '2.63', '3.37', '16.21', '5.23', '5.26', '2.56', '16.2'];
const MIND = ['6.34', '6.35', '6.26', '6.5', '6.6', '6.19', '6.25', '6.12', '2.66', '6.36'];
const REFUGE = ['9.22', '9.29', '9.31', '18.66', '12.6', '12.7', '18.65', '6.30', '9.18', '15.15', '4.11', '7.21', '5.29'];
const GUILT = ['4.36', '4.37', '9.30', '9.31', '18.66', '5.17', '6.40'];
const DESIRE = ['2.62', '2.63', '3.37', '3.39', '3.41', '2.60', '2.58', '2.67', '2.70', '2.71', '5.22', '6.24', '6.26', '6.5', '16.21'];
const OWN_PATH = ['3.35', '18.47', '18.45', '18.46', '18.48', '2.7', '18.63'];
const EQUANIMITY = ['2.38', '2.48', '2.14', '2.15', '2.56', '12.18', '12.19', '14.24', '14.25', '6.7', '5.20', '2.47'];
const PEACE = ['2.66', '2.70', '2.71', '5.29', '12.12', '4.39', '6.7', '6.15', '2.64', '2.65', '5.12', '5.24'];
const SELF = ['2.13', '2.17', '2.18', '2.19', '2.20', '2.22', '2.23', '2.24', '15.7', '6.29', '10.20'];

export const GOLDEN_SET: GoldenCase[] = [
  { id: 'grief-father', message: "My father passed away last month and I can't stop crying. I feel like a part of me is gone.", acceptable: GRIEF },
  { id: 'grief-hinglish', message: 'Mere papa nahi rahe. Kuch bhi accha nahi lagta, sab khaali lagta hai.', acceptable: GRIEF },
  { id: 'grief-pet', message: 'My dog of 14 years died yesterday and the house feels empty.', acceptable: GRIEF },
  { id: 'grief-dying-grandma', message: "My grandmother is very sick and the doctors say she has only weeks left. I'm terrified of losing her.", acceptable: GRIEF },
  { id: 'grief-tanglish', message: 'Amma poitanga, enakku ethuvum pidikkala. Veedu romba kaaliya iruku.', acceptable: GRIEF },

  { id: 'results-interview', message: "I have a big job interview tomorrow and I'm so anxious about whether I'll get it.", acceptable: RESULTS },
  { id: 'results-exam', message: 'Board exams are next week. I keep thinking what if I fail and disappoint my parents.', acceptable: RESULTS },
  { id: 'results-exam-tanglish', message: 'Exam la fail aagiduveno nu romba bayama iruku, padikka mudiyala.', acceptable: RESULTS },
  { id: 'results-credit', message: 'I worked on a project for months and my manager gave the credit to someone else.', acceptable: [...RESULTS, '12.18', '12.19', '6.7'] },
  { id: 'results-startup', message: "I'm a startup founder and I can't sleep because I keep worrying whether the company will succeed.", acceptable: [...RESULTS, '9.22'] },

  { id: 'anger-family', message: 'I get so angry at my family over small things and then regret shouting at them.', acceptable: ANGER },
  { id: 'anger-hinglish', message: 'Bahut gussa aata hai ghar walon pe, control hi nahi hota.', acceptable: ANGER },
  { id: 'anger-revenge', message: 'A colleague insulted me in front of everyone and I want revenge.', acceptable: [...ANGER, '12.18', '12.19', '6.9', '2.14'] },

  { id: 'mind-racing', message: "I can't focus on anything. My mind keeps jumping from one thought to another, especially at night.", acceptable: MIND },
  { id: 'mind-overthinking', message: 'I overthink everything and replay conversations in my head for hours.', acceptable: MIND },
  { id: 'mind-meditation', message: "I try to meditate but my mind won't sit still for even two minutes.", acceptable: MIND },

  { id: 'worth-failure', message: "I feel worthless. Everyone around me is doing better and I'm just a failure.", acceptable: ['6.5', '6.6', '2.3', '3.35', '18.47', '6.40', '2.40', '4.36'] },
  { id: 'worth-enemy', message: 'I keep sabotaging myself. I am my own worst enemy.', acceptable: ['6.5', '6.6', '6.36'] },
  { id: 'worth-give-up', message: "I want to give up on my dream. I don't think I'm strong enough.", acceptable: ['2.3', '2.37', '6.5', '6.40', '2.40', '2.31', '18.78', '2.47'] },

  { id: 'choice-abroad', message: "I don't know whether to take a job abroad or stay with my aging parents. I'm torn.", acceptable: [...OWN_PATH, '2.31', '18.66', '3.8'] },
  { id: 'choice-career', message: "I'm confused about which career to choose: what I love or what pays well.", acceptable: OWN_PATH },
  { id: 'choice-family-business', message: 'My family wants me to join the family business but I want to be an artist.', acceptable: OWN_PATH },

  { id: 'guilt-past', message: 'I did something terrible years ago and the guilt is eating me alive.', acceptable: GUILT },
  { id: 'guilt-cheated', message: 'I cheated on my partner and now I hate myself. Can I ever be a good person again?', acceptable: GUILT },

  { id: 'alone', message: 'I feel completely alone. Nobody understands me or cares about me.', acceptable: REFUGE },
  { id: 'alone-hinglish', message: 'Main bilkul akela mehsoos karta hoon, koi saath nahi deta.', acceptable: REFUGE },
  { id: 'abandoned-by-god', message: 'I feel like God has abandoned me after everything that went wrong.', acceptable: REFUGE },

  { id: 'fear-future', message: "I'm scared of the future. What if everything goes wrong?", acceptable: ['18.66', '9.22', '2.47', '2.56', '2.14', '4.10', '12.15', '6.14', '16.1', '2.40', '6.40'] },
  { id: 'fear-panic', message: "I've been having panic attacks and I'm afraid all the time.", acceptable: ['2.56', '4.10', '18.66', '2.14', '6.14', '12.15', '16.1', '6.5', '2.70', '6.35'] },
  { id: 'fear-death', message: "I'm terrified of dying.", acceptable: ['2.20', '2.27', '2.22', '2.19', '8.5', '2.13', '2.23', '2.24', '2.12', '2.25'] },

  { id: 'addiction-phone', message: "I'm addicted to my phone and social media and I can't stop scrolling.", acceptable: [...DESIRE, '6.35', '6.17'] },
  { id: 'addiction-drink', message: "I can't stop drinking even though I know it's destroying me.", acceptable: DESIRE },
  { id: 'greed-money', message: 'I always want more money. No matter how much I earn it never feels enough.', acceptable: [...DESIRE, '16.12'] },

  { id: 'jealous-friend', message: "I'm jealous of my best friend's success and I hate that I feel this way.", acceptable: ['12.13', '3.35', '2.62', '16.21', '6.9', '18.47', '12.15', '5.25', '3.37', '2.71'] },
  { id: 'compare-instagram', message: 'I keep comparing myself on Instagram with people who seem to have perfect lives.', acceptable: ['3.35', '18.47', '2.71', '2.70', '6.5', '2.62', '12.13', '5.22'] },

  { id: 'breakup', message: "My girlfriend broke up with me and I can't stop thinking about her.", acceptable: ['2.62', '2.14', '2.71', '5.22', '2.70', '6.5', '2.15', '2.64', '6.35', '6.26'] },

  { id: 'failed-business', message: 'My business failed and I lost everything. People are laughing at me.', acceptable: [...EQUANIMITY, '6.40', '2.37', '18.66'] },
  { id: 'praise-criticism', message: 'Praise makes me feel on top of the world but criticism crushes me.', acceptable: EQUANIMITY },

  { id: 'procrastination', message: 'I keep procrastinating and wasting whole days doing nothing.', acceptable: ['3.8', '3.5', '3.4', '6.16', '18.39', '14.8', '2.47', '3.19', '6.5', '18.28'] },
  { id: 'why-work', message: "I feel like doing nothing at all. What's the point of working?", acceptable: ['3.8', '3.5', '3.4', '3.19', '3.20', '2.47', '3.21', '18.48', '3.9'] },

  { id: 'meaningless', message: "My life feels meaningless. I don't know why I'm here.", acceptable: ['18.46', '18.45', '3.30', '9.27', '2.20', '6.5', '15.7', '18.66', '3.9', '12.8', '9.34', '6.47'] },
  { id: 'empty-success', message: 'I have a good job and family, but I still feel empty inside.', acceptable: ['2.70', '2.71', '5.21', '5.24', '6.21', '6.22', '2.66', '9.34', '12.8', '5.29', '15.7', '2.55'] },

  { id: 'peace-chaos', message: "I just want some peace of mind. There's too much chaos in my life.", acceptable: PEACE },
  { id: 'burnout', message: "Work stress is giving me burnout and I'm exhausted all the time.", acceptable: [...PEACE, '6.16', '6.17', '2.47', '2.48', '3.19', '5.10'] },

  { id: 'family-property', message: 'I am fighting with my brother over property and it is tearing the family apart.', acceptable: [...ANGER, '12.13', '6.9', '2.71', '2.70'] },
  { id: 'against-relatives', message: 'I have to stand up to my own relatives who are doing something wrong, but it hurts to go against family.', acceptable: ['2.3', '2.31', '2.33', '2.37', '2.38', '3.35', '18.47', '2.7', '18.63', '2.11'] },

  { id: 'arrogance', message: "People say I'm arrogant. I find it hard to admit when I'm wrong.", acceptable: ['16.4', '16.17', '16.18', '3.27', '18.58', '18.53', '16.13', '16.14', '16.15', '12.13'] },
  { id: 'service-thanks', message: 'I volunteer a lot but sometimes I feel bitter that nobody thanks me.', acceptable: ['3.19', '2.47', '3.25', '17.20', '5.10', '3.9', '18.6', '3.20', '12.18'] },

  { id: 'doubt-god', message: "I've started doubting whether God even exists.", acceptable: ['4.40', '7.7', '7.8', '9.4', '10.8', '10.20', '7.21', '9.10', '4.7', '4.8', '9.22', '9.29', '18.66', '7.19'] },
  { id: 'prayers', message: "My prayers don't seem to be answered.", acceptable: ['9.22', '9.29', '7.21', '7.22', '4.11', '9.26', '18.66', '12.6', '12.7', '9.31'] },

  { id: 'chronic-illness', message: "I've been diagnosed with a chronic illness and I'm struggling to accept it.", acceptable: ['2.14', '2.15', '2.13', '2.20', '2.22', '2.18', '6.23', '18.66', '12.13', '2.38'] },
  { id: 'aging', message: "I'm getting old and it makes me sad that my body is weakening.", acceptable: ['2.13', '2.22', '2.20', '2.14', '2.18', '8.5', '2.27'] },

  { id: 'lifestyle', message: 'I sleep too much, eat junk food, and feel sluggish all day.', acceptable: ['6.16', '6.17', '17.8', '17.9', '17.10', '14.8', '18.39'] },
  { id: 'stage-fright', message: 'I have stage fright. My hands shake before every presentation.', acceptable: ['2.3', '2.14', '2.48', '2.47', '2.56', '6.5', '18.66', '4.10', '2.38'] },
  { id: 'betrayal', message: "My closest friend betrayed my trust and I don't know how to forgive her.", acceptable: ['12.13', '12.14', '12.18', '12.19', '6.9', '16.3', '2.62', '2.63', '5.25', '2.14', '16.2'] },

  { id: 'who-am-i', message: 'Who am I really? Am I just this body and mind?', acceptable: SELF },
  { id: 'closer-to-god', message: 'How can I become closer to God in my daily life?', acceptable: ['9.26', '9.27', '9.34', '12.8', '18.65', '12.6', '12.2', '8.7', '9.22', '18.66', '12.9', '12.10', '6.47'] },
  { id: 'boss-lie', message: 'My boss is asking me to lie to clients. Should I do it to keep my job?', acceptable: ['3.35', '18.47', '16.1', '16.2', '16.3', '18.63', '2.31', '2.33', '18.48', '17.15', '2.38'] },
];
