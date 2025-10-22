import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { axe } from 'jest-axe';
import React from 'react';

import { AppProviders } from '../app/providers';
import { CreateBookWizard } from '../components/CreateBookWizard';

describe('CreateBookWizard', () => {
  beforeEach(() => {
    global.fetch = jest.fn((url) => {
      if (typeof url === 'string' && url.includes('/api/orchestrator')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              id: 'assistant-1',
              role: 'assistant',
              content: 'Guidance received',
              timestamp: new Date().toISOString()
            })
        }) as unknown as Promise<Response>;
      }
      if (typeof url === 'string' && url.includes('/api/ipfs')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ cid: 'bafybeigdyrzt', url: 'https://ipfs.io/ipfs/bafybeigdyrzt' })
        }) as unknown as Promise<Response>;
      }
      throw new Error(`Unhandled fetch: ${url}`);
    });
  });

  it('walks through drafting flow and uploads to IPFS', async () => {
    render(
      <AppProviders>
        <CreateBookWizard />
      </AppProviders>
    );

    fireEvent.change(screen.getByLabelText(/Artifact Title/i), { target: { value: 'Validator Primer' } });
    fireEvent.change(screen.getByLabelText(/Synopsis Draft/i), { target: { value: 'A short synopsis' } });
    fireEvent.click(screen.getByText(/Request orchestrator feedback/i));

    await waitFor(() => {
      if (!screen.queryByText(/Guidance received/i)) {
        throw new Error('Guidance not visible yet');
      }
    });

    fireEvent.click(screen.getByText(/Next step/i));
    fireEvent.change(screen.getByLabelText(/Outline Draft/i), { target: { value: '1. Start 2. Middle' } });
    fireEvent.click(screen.getByText(/Next step/i));
    fireEvent.change(screen.getByLabelText(/Manuscript Draft/i), { target: { value: '# Heading\nContent' } });

    fireEvent.click(screen.getByRole('button', { name: /Upload to IPFS/i }));
    await waitFor(() => {
      if (!screen.queryByText(/Artifact CID/i)) {
        throw new Error('CID not visible yet');
      }
    });
  });

  it('has no detectable accessibility issues', async () => {
    const { container } = render(
      <AppProviders>
        <CreateBookWizard />
      </AppProviders>
    );
    const results = await axe(container);
    if (results.violations.length > 0) {
      throw new Error('Accessibility violations detected');
    }
  });
});
