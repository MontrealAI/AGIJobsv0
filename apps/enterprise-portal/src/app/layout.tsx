import './globals.css';
import type { ReactNode } from 'react';

export const metadata = {
  title: 'AGI Jobs Enterprise Portal',
  description:
    'Enterprise-grade console for verified employers to manage AI job postings, track validation workflows and audit deliverables.'
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <main>{children}</main>
      </body>
    </html>
  );
}
