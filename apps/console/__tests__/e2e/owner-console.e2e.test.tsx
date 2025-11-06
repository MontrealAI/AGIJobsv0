import { render, screen, waitFor, within } from '@testing-library/react';
import App from '../../src/App';

describe('Owner console overview (webapp integration)', () => {
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

  it('renders snapshot information and telemetry metrics', async () => {
    const fetchMock = jest.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.endsWith('/governance/snapshot')) {
        return new Response(
          JSON.stringify({
            chainId: 31337,
            timestamp: '2024-01-01T00:00:00.000Z',
            configs: {
              identity: {
                agentRootNode: 'agent.agi.eth',
                clubRootNode: 'club.agi.eth',
                agentMerkleRoot: '0xagent',
                validatorMerkleRoot: '0xvalidator',
              },
            },
            onChain: {
              stakeManager: {
                minStakeLabel: '5000 AGIA',
                feePctLabel: '4%',
                burnPctLabel: '1%',
                validatorRewardPctLabel: '30%',
                treasury: '0x0000000000000000000000000000000000000001',
              },
              jobRegistry: {
                jobStakeLabel: '100 AGIA',
                maxJobRewardLabel: '250 AGIA',
                maxJobDurationLabel: '7 days',
                feePctLabel: '2%',
                validatorRewardPctLabel: '10%',
              },
              feePool: {
                burnPctLabel: '0.5%',
                treasury: '0x000000000000000000000000000000000000002a',
              },
              identityRegistry: {
                agentRootNode: 'agent.agi.eth',
                clubRootNode: 'club.agi.eth',
                agentMerkleRoot: '0xagent',
                validatorMerkleRoot: '0xvalidator',
              },
            },
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }
      if (url.endsWith('/metrics')) {
        return new Response(
          'paymaster_balance 500000000000000000000\npaymaster_last_topup 1700000000',
          {
            status: 200,
            headers: { 'Content-Type': 'text/plain' },
          }
        );
      }
      throw new Error(`Unhandled request: ${url}`);
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<App />);

    expect(
      await screen.findByRole('heading', { name: /AGI Jobs Owner Console/i })
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/governance/snapshot'),
        expect.anything()
      );
    });

    const minimumStakeCard = await screen.findByRole('heading', {
      name: /Minimum Stake/i,
    });
    expect(minimumStakeCard.nextElementSibling).toHaveTextContent('5000 AGIA');

    const validatorRewardCards = await screen.findAllByRole('heading', {
      name: /Validator Reward %/i,
    });
    expect(validatorRewardCards[0].nextElementSibling).toHaveTextContent('30%');

    const identitySection = await screen.findByRole('heading', {
      name: /Identity Roots/i,
    });
    expect(identitySection).toBeInTheDocument();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/metrics'),
        expect.anything()
      );
    });

    const gasPanelHeading = await screen.findByRole('heading', {
      name: /Gas & Paymaster/i,
    });
    expect(
      within(gasPanelHeading.parentElement as HTMLElement).getByText('500 AGIA')
    ).toBeInTheDocument();
  });
});
