import { describe, expect, it } from 'vitest';
import { Sentinel } from '../src/sentinel/sentinel.js';
import { AgentProfile } from '../src/types.js';

const sentinel = new Sentinel({
  budgetOverrunThreshold: 5n,
  unsafeCallSignatures: ['delegatecall(bytes)'],
  slaBlocks: 1,
});

const agent: AgentProfile = {
  address: '0x01',
  ensName: 'clio.agent.agi.eth',
  domain: 'research',
  budgetLimit: 4n,
};

describe('Sentinel', () => {
  it('detects budget overruns', () => {
    sentinel.monitor(
      {
        jobId: 'job-1',
        domain: 'research',
        executedBy: 'clio.agent.agi.eth',
        success: true,
        cost: 10n,
        metadataHash: '0x01',
      },
      agent,
      'call(bytes)'
    );
    expect(sentinel.getAlerts()).toHaveLength(1);
  });

  it('detects unsafe calls', () => {
    sentinel.monitor(
      {
        jobId: 'job-2',
        domain: 'research',
        executedBy: 'clio.agent.agi.eth',
        success: true,
        cost: 2n,
        metadataHash: '0x02',
      },
      agent,
      'delegatecall(bytes)'
    );
    expect(sentinel.getAlerts().length).toBeGreaterThanOrEqual(2);
  });
});
