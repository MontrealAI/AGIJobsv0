import userEvent from '@testing-library/user-event';
import { render, screen, waitFor } from '@testing-library/react';
import App from '../../src/App';
import receiptsFixture from '../fixtures/governance/receipts-agent-win.json';

describe('Owner governance job flow (webapp integration)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.localStorage.setItem(
      'agi-console.api-config',
      JSON.stringify({
        baseUrl: 'https://orchestrator.example',
        token: 'secret',
      })
    );
  });

  afterEach(() => {
    (global.fetch as jest.Mock | undefined)?.mockClear?.();
  });

  it('previews configuration updates and inspects receipts', async () => {
    const fetchMock = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.endsWith('/governance/snapshot')) {
        return new Response(
          JSON.stringify({
            chainId: 31337,
            timestamp: new Date('2024-04-05T12:00:00Z').toISOString(),
            configs: {},
            onChain: {},
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (url.endsWith('/governance/preview')) {
        const rawBody = typeof init?.body === 'string' ? init.body : '';
        const parsed = rawBody ? JSON.parse(rawBody) : {};
        return new Response(
          JSON.stringify({
            diff: {
              action: parsed.key,
              value: parsed.value ?? null,
            },
            bundle: {
              digest: '0xabc123',
              targets: ['jobRegistry'],
            },
            args: parsed,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (url.includes('/governance/receipts')) {
        expect(url).toContain('planHash=0xplan');
        expect(url).toContain('jobId=42');
        return new Response(JSON.stringify(receiptsFixture), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.endsWith('/metrics')) {
        return new Response('', {
          status: 200,
          headers: { 'Content-Type': 'text/plain' },
        });
      }
      throw new Error(`Unhandled request: ${url}`);
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<App />);

    await screen.findByRole('heading', { name: /AGI Jobs Owner Console/i });

    const actionSelect = screen.getByLabelText('Action');
    await userEvent.selectOptions(actionSelect, ['jobRegistry.setJobStake']);
    await waitFor(() => {
      expect((actionSelect as HTMLSelectElement).value).toBe(
        'jobRegistry.setJobStake'
      );
    });

    await waitFor(() => {
      expect(screen.getByLabelText('Value')).toHaveAttribute(
        'placeholder',
        'AGIA amount (decimals allowed).'
      );
    });

    const valueField = screen.getByLabelText('Value');
    await userEvent.clear(valueField);
    await userEvent.type(valueField, '150');

    await userEvent.click(screen.getByRole('button', { name: /Preview Change/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/governance/preview'),
        expect.objectContaining({ method: 'POST' })
      );
    });

    expect(await screen.findByText(/Diff/i)).toBeInTheDocument();
    const diffSnippets = await screen.findAllByText(/jobRegistry\.setJobStake/i);
    expect(diffSnippets.length).toBeGreaterThan(0);

    const planHashInput = screen.getByLabelText('Plan Hash');
    await userEvent.type(planHashInput, '0xplan');

    const jobIdInput = screen.getByLabelText('Job ID');
    await userEvent.type(jobIdInput, '42');

    await userEvent.click(screen.getByRole('button', { name: /Search Receipts/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/governance/receipts'),
        expect.anything()
      );
    });

    expect(await screen.findByText('job.finalized')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Details' }));

    expect(await screen.findByTestId('receipt-details')).toBeInTheDocument();
    expect(await screen.findByTestId('receipt-status-value')).toHaveTextContent(
      'agent_win'
    );
  });
});
