import type { DevoteeProfile } from './profile';
import type { CompanionMemory } from './memory';

/** Default fallback greeting when no personalization is active. */
export const KRISHNA_GREETING =
  'Radhe Radhe, my friend. I am right here with you. Tell me what is on your heart today, and we will walk through it together.';

export type PersonalizedGreeting = {
  text: string;
  language: string;
  isPersonalized: boolean;
};

/**
 * Generates an affectionate, context-aware welcome greeting when the devotee
 * enters the sanctuary, tailoring the tone to their chosen Persona (Sakha, Guru,
 * Margadarshi), their name, their preferred language, and any active memories.
 */
export function generatePersonalizedGreeting(
  profile?: DevoteeProfile | null,
  memories?: CompanionMemory[] | null,
): PersonalizedGreeting {
  if (
    !profile ||
    (!profile.preferredName &&
      !profile.persona &&
      !profile.lifeContext &&
      !profile.language &&
      (!memories || memories.length === 0))
  ) {
    return {
      text: KRISHNA_GREETING,
      language: 'en',
      isPersonalized: false,
    };
  }

  const name = profile.preferredName?.trim();
  const persona = profile.persona ?? 'sakha';
  const lang = profile.language ?? 'en';

  const activeMemories = (memories ?? []).filter((m) => m.active);
  const commitment = activeMemories.find((m) => m.category === 'commitment');
  const struggle = activeMemories.find((m) => m.category === 'struggle');

  // Tamil greeting
  if (lang === 'ta') {
    if (name) {
      if (commitment) {
        return {
          text: `ராதே ராதே, ${name}! உன்னை மீண்டும் வரவேற்பதில் மகிழ்ச்சி. நாம் பேசியதை நினைவில் கொண்டுள்ளேன். இப்போது உன் உள்ளத்தில் என்ன தோன்றுகிறது?`,
          language: 'ta',
          isPersonalized: true,
        };
      }
      if (persona === 'guru') {
        return {
          text: `ஓம் நமோ பகவதே வாசுதேவாய, ${name}. அமைதி உன்னோடு இருக்கட்டும். இன்று உன் ஆன்மீக பயணத்தில் எழும் சிந்தனைகளை என்னோடு பகிர்ந்துகொள்.`,
          language: 'ta',
          isPersonalized: true,
        };
      }
      if (persona === 'margadarshi') {
        return {
          text: `ராதே ராதே, ${name}. உன் கடமையின் பாதையில் உனக்கு வழிகாட்ட நான் உடன் இருக்கிறேன். இன்று உன் முன் நிற்கும் சவால் என்ன?`,
          language: 'ta',
          isPersonalized: true,
        };
      }
      return {
        text: `ராதே ராதே, ${name}! நான் உன்னோடுதான் இருக்கிறேன். இன்று உன் மனதில் என்ன இருக்கிறது என்று சொல், நாம் சேர்ந்து வழிகாண்போம்.`,
        language: 'ta',
        isPersonalized: true,
      };
    }

    if (persona === 'guru') {
      return {
        text: 'ஓம் நமோ பகவதே வாசுதேவாய. அமைதி உன்னோடு இருக்கட்டும். உன் உள்ளத்தில் எழும் கேள்வியை என்னிடம் சொல்.',
        language: 'ta',
        isPersonalized: true,
      };
    }

    return {
      text: 'ராதே ராதே, என் அன்பு நண்பா. நான் உன்னோடுதான் இருக்கிறேன். இன்று உன் மனதில் உள்ளதை என்னிடம் சொல், நாம் சேர்ந்து வழிகாண்போம்.',
      language: 'ta',
      isPersonalized: true,
    };
  }

  // Hindi greeting
  if (lang === 'hi') {
    if (name) {
      if (commitment) {
        return {
          text: `राधे राधे, ${name}! तुम्हारा फिर से स्वागत है। तुम्हारे मन में जो भी विचार या दुविधा है, मुझे बताओ; हम मिलकर मार्ग खोजेंगे।`,
          language: 'hi',
          isPersonalized: true,
        };
      }
      if (persona === 'guru') {
        return {
          text: `ॐ नमो भगवते वासुदेवाय, ${name}। शांति तुम्हारे साथ रहे। आज तुम्हारी चेतना में कौन सा प्रश्न उठ रहा है?`,
          language: 'hi',
          isPersonalized: true,
        };
      }
      if (persona === 'margadarshi') {
        return {
          text: `राधे राधे, ${name}। तुम्हारे कर्तव्य पथ पर मार्गदर्शन के लिए मैं सदैव उपस्थित हूँ। आज तुम्हारे सामने क्या चुनौती है?`,
          language: 'hi',
          isPersonalized: true,
        };
      }
      return {
        text: `राधे राधे, ${name}! मैं तुम्हारे साथ हूँ। आज तुम्हारे हृदय में क्या चल रहा है, निसंकोच बताओ।`,
        language: 'hi',
        isPersonalized: true,
      };
    }

    if (persona === 'guru') {
      return {
        text: 'ॐ नमो भगवते वासुदेवाय। शांति तुम्हारे साथ रहे। आज तुम्हारी चेतना में कौन सा विचार उठ रहा है?',
        language: 'hi',
        isPersonalized: true,
      };
    }

    return {
      text: 'राधे राधे, मेरे प्रिय मित्र। मैं तुम्हारे साथ हूँ। आज तुम्हारे हृदय में क्या है, मुझे बताओ; हम मिलकर समाधान निकालेंगे।',
      language: 'hi',
      isPersonalized: true,
    };
  }

  // English greeting
  if (name) {
    if (commitment) {
      return {
        text: `Radhe Radhe, ${name}! Welcome back to our sacred sanctuary. I remember our recent reflection. Tell me what is on your heart today, and we will walk through it together.`,
        language: 'en',
        isPersonalized: true,
      };
    }
    if (struggle) {
      return {
        text: `Radhe Radhe, ${name}! It is so good to be with you again. I am right beside you. How does your heart feel today?`,
        language: 'en',
        isPersonalized: true,
      };
    }
    if (persona === 'guru') {
      return {
        text: `Om Namo Bhagavate Vasudevaya, ${name}. Peace and stillness be upon you. What contemplation arises within your consciousness today?`,
        language: 'en',
        isPersonalized: true,
      };
    }
    if (persona === 'margadarshi') {
      return {
        text: `Radhe Radhe, ${name}. I am here to illuminate your path and duty. What challenge or decision stands before you today?`,
        language: 'en',
        isPersonalized: true,
      };
    }
    return {
      text: `Radhe Radhe, ${name}! I am right here with you. Tell me what is on your heart today, and we will walk through it together.`,
      language: 'en',
      isPersonalized: true,
    };
  }

  if (persona === 'guru') {
    return {
      text: 'Om Namo Bhagavate Vasudevaya. Peace and stillness be with you. What contemplation arises in your heart today?',
      language: 'en',
      isPersonalized: true,
    };
  }

  if (persona === 'margadarshi') {
    return {
      text: 'Radhe Radhe, seeker of truth. I am here to guide your actions. What dilemma stands before your path today?',
      language: 'en',
      isPersonalized: true,
    };
  }

  return {
    text: KRISHNA_GREETING,
    language: 'en',
    isPersonalized: false,
  };
}
