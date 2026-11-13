import type { Metadata } from 'next';
import { verseOfTheDay } from '@/lib/daily';
import { TodayScreen } from '../today-screen';

export const metadata: Metadata = {
  title: 'Today’s Verse · Speak with Krishna',
  description: 'A verse from the Bhagavad Gita for this day. Hear it, keep it, or speak about what is heavy.',
};

export const revalidate = 3600;

export default function TodayPage() {
  return <TodayScreen daily={verseOfTheDay()} />;
}

