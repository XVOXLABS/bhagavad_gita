import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Inter, Noto_Serif_Devanagari, Source_Serif_4 } from 'next/font/google';
import { AppShell } from './app-shell';
import './tokens.css';
import './globals.css';
import './stage/stage.css';

const serif = Source_Serif_4({
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
  title: 'GitaLens · Speak with Krishna',
  description: 'Tell Krishna what is in your heart, and receive guidance from a real verse of the Bhagavad Gita.',
};

export const viewport: Viewport = {
  themeColor: '#120c16',
  colorScheme: 'dark',
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${serif.variable} ${inter.variable} ${devanagari.variable}`}>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
