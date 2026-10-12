import type { Metadata } from 'next';
import { MyGitaScreen } from './my-gita-screen';

export const metadata: Metadata = {
  title: 'My Gita · Speak with Krishna',
  description: 'Verses you saved on this device.',
};

export default function MyGitaPage() {
  return <MyGitaScreen />;
}
