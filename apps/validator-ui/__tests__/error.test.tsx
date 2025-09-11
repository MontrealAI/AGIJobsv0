import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import * as matchers from '@testing-library/jest-dom/matchers';
import { ErrorProvider, useError } from '../lib/error';
import Toast from '../components/Toast';

expect.extend(matchers);

function Trigger() {
  const { setError } = useError();
  return <button onClick={() => setError('boom')}>Trigger</button>;
}

describe('Toast', () => {
  it('renders error and dismisses', () => {
    render(
      <ErrorProvider>
        <Toast />
        <Trigger />
      </ErrorProvider>
    );

    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.click(screen.getByText('Trigger'));
    expect(screen.getByRole('alert')).toHaveTextContent('boom');
    fireEvent.click(screen.getByText('Dismiss'));
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
