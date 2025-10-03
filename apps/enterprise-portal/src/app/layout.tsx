import './globals.css';
import type { ReactNode } from 'react';
import { LocalizationProvider } from '../context/LocalizationContext';

export const metadata = {
  title: 'AGI Jobs Enterprise Portal',
  description:
    'Enterprise-grade console for verified employers to manage AI job postings, track validation workflows and audit deliverables.'
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <LocalizationProvider>
          <main>{children}</main>
        </LocalizationProvider>
      </body>
    </html>
  );
}
