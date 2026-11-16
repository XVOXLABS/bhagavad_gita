import type { Metadata } from 'next';
import { StageScreen } from './stage/stage-screen';

export const metadata: Metadata = {
  title: 'GitaLens · Speak with Krishna',
  description: 'Tell Krishna what is in your heart, and receive guidance from a real verse of the Bhagavad Gita.',
};

export default function HomePage() {
  return <StageScreen />;
}
