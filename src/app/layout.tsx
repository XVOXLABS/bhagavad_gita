import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Fraunces, Inter, Noto_Serif_Devanagari } from 'next/font/google';
import './tokens.css';
import './globals.css';

const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-serif',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

const devanagari = Noto_Serif_Devanagari({
  subsets: ['devanagari'],
  weight: ['400', '500', '600'],
  variable: '--font-devanagari',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Speak with Krishna · Bhagavad Gita guidance',
  description: 'Share what is on your heart and receive a verse from the Bhagavad Gita that speaks to it.',
};

export const viewport: Viewport = {
  themeColor: '#060a1c',
  colorScheme: 'dark',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${inter.variable} ${devanagari.variable}`}>
      <body>{children}</body>
    </html>
  );
}
