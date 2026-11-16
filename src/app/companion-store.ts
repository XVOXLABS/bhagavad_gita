'use client';

import { useEffect, useRef, useState } from 'react';
import {
  cleanMemory,
  DEFAULT_PROFILE,
  isFamiliarity,
  isTone,
  MAX_MEMORIES,
  sameMemory,
  type Familiarity,
  type Profile,
  type Tone,
} from '@/lib/companion';
import { isLanguage } from '@/lib/language';
import { uid } from './uid';
import { readPref, writePref } from './use-speech';

/** One thing Krishna remembers about the person, with the day they said it. */
export type MemoryItem = { id: string; text: string; at: string };

const TONE_KEY = 'gita.tone';
const KNOW_KEY = 'gita.know';
const LANG_KEY = 'gita.lang';
const MEMORY_KEY = 'gita.memory';
/** Also read by the conversation, to decide whether the thread is kept for the next visit. */
const MEMORY_ON_KEY = 'gita.memoryOn';

export function dropPref(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Storage blocked: there was nothing kept to remove.
  }
}

function readMemories(): MemoryItem[] {
  try {
    const data: unknown = JSON.parse(readPref(MEMORY_KEY) ?? '[]');
    if (!Array.isArray(data)) return [];
    return data
      .filter((item): item is MemoryItem => Boolean(item) && typeof item.id === 'string' && typeof item.text === 'string' && typeof item.at === 'string')
      .map((item) => ({ ...item, text: cleanMemory(item.text) }))
      .filter((item) => item.text)
      .slice(-MAX_MEMORIES);
  } catch {
    return [];
  }
}

/**
 * How Krishna speaks to this person and what he remembers of them. Everything is kept on this device;
 * it travels to the server only alongside a message, and the server stores none of it.
 */
export function useCompanion() {
  const [tone, setToneState] = useState<Tone>(DEFAULT_PROFILE.tone);
  const [familiarity, setFamiliarityState] = useState<Familiarity>(DEFAULT_PROFILE.familiarity);
  const [memoryOn, setMemoryOnState] = useState(true);
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  // sendMessage can run from a callback made on an earlier render, so it reads the latest values here.
  const latest = useRef({ tone, familiarity, language: '', memoryOn, memories });

  useEffect(() => {
    const savedTone = readPref(TONE_KEY);
    const savedKnow = readPref(KNOW_KEY);
    const savedLang = readPref(LANG_KEY);
    const on = readPref(MEMORY_ON_KEY) !== '0';
    const kept = readMemories();
    latest.current = {
      tone: isTone(savedTone) ? savedTone : DEFAULT_PROFILE.tone,
      familiarity: isFamiliarity(savedKnow) ? savedKnow : DEFAULT_PROFILE.familiarity,
      language: isLanguage(savedLang) ? savedLang : '',
      memoryOn: on,
      memories: kept,
    };
    setToneState(latest.current.tone);
    setFamiliarityState(latest.current.familiarity);
    setMemoryOnState(on);
    setMemories(kept);
  }, []);

  function setTone(value: Tone) {
    latest.current.tone = value;
    setToneState(value);
    writePref(TONE_KEY, value);
  }

  function setFamiliarity(value: Familiarity) {
    latest.current.familiarity = value;
    setFamiliarityState(value);
    writePref(KNOW_KEY, value);
  }

  /** The language Krishna last replied in, so the next visit begins in it. */
  function setLanguage(value: string) {
    if (!isLanguage(value) || value === latest.current.language) return;
    latest.current.language = value;
    writePref(LANG_KEY, value);
  }

  function saveMemories(next: MemoryItem[]) {
    latest.current.memories = next;
    setMemories(next);
    if (next.length > 0) writePref(MEMORY_KEY, JSON.stringify(next));
    else dropPref(MEMORY_KEY);
  }

  function setMemoryOn(value: boolean) {
    latest.current.memoryOn = value;
    setMemoryOnState(value);
    writePref(MEMORY_ON_KEY, value ? '1' : '0');
  }

  /** Adds what the server found worth keeping from the last message. Returns how many were new. */
  function remember(lines: string[]): number {
    if (!latest.current.memoryOn) return 0;
    const today = new Date().toISOString().slice(0, 10);
    const next = [...latest.current.memories];
    let added = 0;
    for (const line of lines) {
      const text = cleanMemory(line);
      if (!text || next.some((item) => sameMemory(item.text, text))) continue;
      next.push({ id: uid(), text, at: today });
      added += 1;
    }
    if (added > 0) saveMemories(next.slice(-MAX_MEMORIES));
    return added;
  }

  function forget(id: string) {
    saveMemories(latest.current.memories.filter((item) => item.id !== id));
  }

  function forgetAll() {
    saveMemories([]);
  }

  /** What is sent with a message. With remembering off, nothing Krishna was told before is sent. */
  function person(name: string): { profile: Profile; memory: string[] } {
    const now = latest.current;
    return {
      profile: { name: name.trim(), tone: now.tone, familiarity: now.familiarity, language: now.language },
      memory: now.memoryOn ? now.memories.map((item) => item.text) : [],
    };
  }

  return { tone, setTone, familiarity, setFamiliarity, setLanguage, memoryOn, setMemoryOn, memories, remember, forget, forgetAll, person };
}

export type Companion = ReturnType<typeof useCompanion>;
