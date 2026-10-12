# Speak with Krishna — Devotee product UX

**Document for:** product and engineering  
**Product:** Speak with Krishna  
**Decision this spec locks:** Today is the front door. Talk, Read, and My Gita sit behind it. There is no payment in this version.

---

## 1. Recommendation

A devotee opens the app and meets one verse. They can hear it, save it, or share it. If something in life is heavy, they say so and receive guidance grounded in a real verse. The 18 chapters stay one tap away.

Talk-first asks a new person to know what to type. Study-first hides the conversation, which is the thing a printed Gita does not do. Daily sadhana uses both: the verse is the habit, the conversation is there when life needs it.

**Assumption, to validate:** the person we are designing for opens a phone in the morning, or when troubled. The chrome is English. Hindi meaning can already sit on a verse. This has not been tested with devotees.

---

## 2. Four places

Same night-temple look already in the app: indigo, gold, Fraunces for titles, Devanagari for Sanskrit.

| Place | Route | What the devotee does |
| --- | --- | --- |
| Today | `/` | Read the verse of the day. Hear it, save it, share it. Name what is heavy, or begin Chapter 1. |
| Talk | `/talk` | Describe a situation. Receive guidance and a verified verse. Voice, crisis help, and a new conversation stay here. |
| Read | `/gita`, `/gita/[chapter]` | Read all 18 chapters. Continue the chapter last opened on this device. |
| My Gita | `/my-gita` | Verses saved on this device. |

One top bar on every page: Today, Talk, Read, My Gita. The name Speak with Krishna returns to Today.

```
Open the app
    |
    v
  Today ---- hear / save / share
    |            |
    |            +--> image a devotee can send
    |
    +--> "What is heavy today?" --> Talk (today's verse still in view)
    |                                  |
    |                                  +--> cited verse --> open that verse in Read
    |
    +--> Begin Chapter 1 --> Read --> Continue later (this browser)
```

Sanskrit on every card is copied from the verse store. The server attaches verse text. The model does not write scripture.

---

## 3. How a devotee gets in

No account. No payment. No streak. A missed day should not feel like failure.

**Arrive.** The first screen is Today, not a tutorial and not an empty chat. Three quiet starts:

1. Hear today's verse.
2. Name what is heavy. That opens Talk with the verse still on screen and the words, if any, waiting in the box.
3. Begin Chapter 1.

On a first visit to Talk, four situation chips fill the box so it is not empty: fear, duty, grief, a quarrel. They are everyday situations. They are not labels stored on verses.

**Return.** The verse changes at midnight India time. My Gita and the last chapter live in this browser, so a refresh keeps them. They do not follow the person to a new phone until an account exists. That account is later work.

**Invite.** Share creates an image of the verse: Sanskrit, chapter and verse, and the name Speak with Krishna. The devotee sends a verse, not a signup link.

**Listen.** Hear on Today reads the chapter, the verse number, and the short meaning in the device voice. Listen on a Talk reply is unchanged.

---

## 4. Screens

### Today

- Kicker, title, and the day's verse card: Sanskrit, short meaning, chapter and verse linking into Read.
- Hear, Save, Share on that card.
- One question: "What is heavy today?" Submitting opens `/talk?today=1` with the typed words in the box. Submitting empty still opens Talk with the verse in view.
- A link to Chapter 1.
- If the day's verse cannot be loaded: a short empty state, plus Talk and Chapter 1. No invented verse.

### Talk

- Empty visit: a short heading, the four situation chips, and the composer. "Talk to Krishna" remains when the browser can speak and listen.
- Visit from Today: the day's verse sits above the chips. The heading is "What is heavy today?"
- A reply still shows Krishna's words, the crisis card when needed, the verse card, and today's practice. Streaming lines stay ("Krishna is listening", and the lines that follow).
- Voice settings and New conversation stay on this page only.
- Errors already in the product stay: reply could not be completed; microphone heard nothing; image could not be created.
- The composer keeps the line that this is an AI guide inspired by the Gita, not a substitute for professional help.

### Read

- Chapter list as it is now.
- If this browser has opened a chapter, a "Continue reading" card sits above the list.
- Opening a chapter stores that chapter number and name on this device.

### My Gita

- Saved verses, newest first, same card as everywhere else.
- Empty: "No verses saved yet", with ways back to Today and Read. Nothing here asks the person to start a conversation they did not come for.

---

## 5. What the code already did, and what this spec adds

| Already in the product | Added by this spec |
| --- | --- |
| Verse of the day, midnight IST | Today is the home page, not a block under an empty chat |
| Chat, citation check, crisis card, voice | Talk is its own page; chips are fear, duty, grief, a quarrel |
| Chapter reader | Continue reading, stored in the browser |
| Save and share in the browser | My Gita is its own page, linked from every screen |
| Separate headers on chat and reader | One shared top bar |

**Not in this version:** payment, accounts, streaks, festival dates, a language switch in the chrome. The chat pipeline can answer in the language of the message; the screen is still English. Festival content waits for an authorized source. Do not copy another site's verse notes.

---

## 6. Edges

- Private mode or blocked storage: saves and the last chapter last for this visit only. The screen does not pretend they will survive.
- Share can fail. The toast says the image could not be created.
- A crisis message replaces ordinary guidance and shows helplines. That path is unchanged.
- Reduced motion: existing styles already shorten animation.
- The four places must be reachable by keyboard. The current place is marked in the nav.

---

## 7. Assumptions and limits

- We have no interviews and no analytics. The daily-verse habit is a product judgment, not a research finding.
- "Krishna" in the interface means the Gita's words, checked by the server, not a free-form guru.
- Saved verses and the last chapter can disappear when the person changes browser or phone.
- Hear on Today uses the device voice. A lifelike voice still belongs to Talk replies, where a spoken reply already exists.
