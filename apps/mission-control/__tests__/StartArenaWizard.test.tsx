import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { axe } from 'jest-axe';
import React from 'react';

import { AppProviders } from '../app/providers';
import { StartArenaWizard } from '../components/StartArenaWizard';

describe('StartArenaWizard', () => {
  beforeEach(() => {
    global.fetch = jest.fn((url) => {
      if (typeof url === 'string' && url.includes('/api/arena/launch')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ arenaId: 'arena-vanguard-1234' })
        }) as unknown as Promise<Response>;
      }
      throw new Error('Unhandled fetch');
    });
  });

  it('validates required fields and launches arena', async () => {
    render(
      <AppProviders>
        <StartArenaWizard />
      </AppProviders>
    );

    fireEvent.click(screen.getByRole('button', { name: /Launch arena/i }));
    if (!screen.queryByText(/Artifact name is required/i)) {
      throw new Error('Validation copy missing');
    }

    fireEvent.change(screen.getByLabelText(/Artifact/i), { target: { value: 'Nebula Recovery Codex' } });
    fireEvent.click(screen.getByRole('button', { name: /Launch arena/i }));

    await waitFor(() => {
      if (!screen.queryByText(/Live status for arena-vanguard-1234/i)) {
        throw new Error('Arena status not visible yet');
      }
    });
  });

  it('is accessible', async () => {
    const { container } = render(
      <AppProviders>
        <StartArenaWizard />
      </AppProviders>
    );
    const results = await axe(container);
    if (results.violations.length > 0) {
      throw new Error('Accessibility violations detected');
    }
  });
});
