import type { Metadata } from 'next';
import { verseOfTheDay } from '@/lib/daily';
import { ChatScreen } from '../chat-screen';

export const metadata: Metadata = {
  title: 'Talk · Speak with Krishna',
  description: 'Share what is on your heart and receive a verse from the Bhagavad Gita.',
};

// Re-render hourly so a visit from Today still shows the verse after midnight IST.
export const revalidate = 3600;

type Search = Promise<{ today?: string }>;

export default async function TalkPage({ searchParams }: { searchParams: Search }) {
  const params = await searchParams;
  return <ChatScreen daily={verseOfTheDay()} withToday={params.today === '1'} />;
}
