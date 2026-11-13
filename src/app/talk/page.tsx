import type { Metadata } from 'next';
import { verseOfTheDay } from '@/lib/daily';
import { SanctuaryScreen } from '../sanctuary-screen';

export const metadata: Metadata = {
  title: 'Speak with Krishna · Your Sacred Companion',
  description: 'Meet Krishna face-to-face. Speak with your dearest friend and receive guidance grounded in the Bhagavad Gita.',
};

export const revalidate = 3600;

export default function TalkPage() {
  return <SanctuaryScreen daily={verseOfTheDay()} />;
}
