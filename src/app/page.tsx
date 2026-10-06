import { verseOfTheDay } from '@/lib/daily';
import { ChatScreen } from './chat-screen';

// Re-render hourly so the Verse of the Day turns over soon after midnight IST.
export const revalidate = 3600;

export default function HomePage() {
  return <ChatScreen daily={verseOfTheDay()} />;
}
