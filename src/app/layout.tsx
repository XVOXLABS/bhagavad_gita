import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Fraunces, Noto_Serif_Devanagari } from 'next/font/google';
import './globals.css';

const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-serif',
  display: 'swap',
});

const devanagari = Noto_Serif_Devanagari({
  subsets: ['devanagari'],
  weight: ['500', '600'],
  variable: '--font-devanagari',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Speak with Krishna',
  description: 'Guidance grounded in verses of the Bhagavad Gita.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${devanagari.variable}`}>
      <body>{children}</body>
    </html>
  );
}
