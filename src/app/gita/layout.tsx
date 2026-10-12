import type { ReactNode } from 'react';

export default function GitaLayout({ children }: { children: ReactNode }) {
  return <main className="content reader">{children}</main>;
}
