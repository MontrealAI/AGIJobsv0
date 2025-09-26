import type { ReactNode } from 'react';
import './globals.css';

export const metadata = {
  title: 'AGI Jobs One-Box',
  description: 'ChatGPT-simple UI for orchestrating AGI Jobs v2 flows',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="onebox-body">
        <main className="onebox-main">
          <header className="onebox-header">
            <h1 className="onebox-title">AGI Jobs One-Box</h1>
            <p className="onebox-subtitle">
              Chat with the orchestrator to post, validate, and finalize jobs without touching a wallet.
            </p>
          </header>
          {children}
        </main>
      </body>
    </html>
  );
}
