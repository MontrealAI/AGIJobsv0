import './globals.css';

import { Metadata } from 'next';
import { Suspense } from 'react';

import { NavigationShell } from '../components/NavigationShell';
import { AppProviders } from './providers';

export const metadata: Metadata = {
  title: 'AGIJobs Mission Control',
  description: 'Mission Control for AGIJobs artifacts, arenas, and owner controls.'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AppProviders>
          <Suspense fallback={<div className="p-8 text-lg">Loading mission control…</div>}>
            <NavigationShell>{children}</NavigationShell>
          </Suspense>
        </AppProviders>
      </body>
    </html>
  );
}
