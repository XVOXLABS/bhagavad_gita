import type { Metadata } from 'next';
import { verseOfTheDay } from '@/lib/daily';
import { TodayScreen } from './today-screen';

export const metadata: Metadata = {
  title: 'Today · Speak with Krishna',
  description: 'A verse from the Bhagavad Gita for this day. Hear it, keep it, or speak about what is heavy.',
};

// Re-render hourly so the Verse of the Day turns over soon after midnight IST.
export const revalidate = 3600;

export default function HomePage() {
  return <TodayScreen daily={verseOfTheDay()} />;
}
