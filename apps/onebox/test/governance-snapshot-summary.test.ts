import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOwnerTelemetryCards } from '../src/lib/governanceSnapshot';

test('buildOwnerTelemetryCards summarises on-chain policies', () => {
  const cards = buildOwnerTelemetryCards({
    timestamp: '2024-01-01T00:00:00Z',
    chainId: 31337,
    onChain: {
      jobRegistry: {
        address: '0x0000000000000000000000000000000000000001',
        maxJobRewardLabel: '250 AGIA',
        jobStakeLabel: '75 AGIA',
        maxJobDurationLabel: '10 days',
        validatorRewardPctLabel: '12%',
        feePctLabel: '3%',
      },
      stakeManager: {
        address: '0x0000000000000000000000000000000000000002',
        minStakeLabel: '5000 AGIA',
        validatorRewardPctLabel: '25%',
        feePctLabel: '4%',
        burnPctLabel: '1%',
        treasury: '0x00000000000000000000000000000000000000aa',
      },
      feePool: {
        address: '0x0000000000000000000000000000000000000003',
        burnPctLabel: '0.5%',
        treasury: '0x00000000000000000000000000000000000000bb',
      },
      identityRegistry: {
        address: '0x0000000000000000000000000000000000000004',
        agentRootNode: 'agent.agi.eth',
        clubRootNode: 'club.agi.eth',
        agentMerkleRoot: '0xagent',
        validatorMerkleRoot: '0xvalidator',
      },
    },
  });

  const byId = new Map(cards.map((card) => [card.id, card]));
  assert.equal(cards.length, 4);
  assert(byId.has('job-policy'));
  assert(byId.has('stake-manager'));
  assert(byId.has('fee-pool'));
  assert(byId.has('identity-registry'));

  const jobCard = byId.get('job-policy');
  assert(jobCard);
  assert.equal(jobCard.metrics.length >= 4, true);
  assert.equal(jobCard.metrics[0].label, 'Max job reward');
  assert.equal(jobCard.metrics[0].value, '250 AGIA');
  assert(jobCard.footnote?.includes('0x0000000000000000000000000000000000000001'));

  const stakeCard = byId.get('stake-manager');
  assert(stakeCard);
  assert.equal(
    stakeCard.metrics.find((metric) => metric.label === 'Treasury')?.value,
    '0x00000000000000000000000000000000000000aa'
  );

  const identityCard = byId.get('identity-registry');
  assert(identityCard);
  assert.equal(
    identityCard.metrics.find((metric) => metric.label === 'Agent ENS root')?.value,
    'agent.agi.eth'
  );
  assert(identityCard.footnote?.includes('0x0000000000000000000000000000000000000004'));
});

test('buildOwnerTelemetryCards gracefully ignores malformed sections', () => {
  const cards = buildOwnerTelemetryCards({
    onChain: {
      jobRegistry: null as unknown as Record<string, unknown>,
    },
    configs: {
      identity: {
        agentRootNode: 'agent.agi.eth',
        validatorMerkleRoot: '0xvalidator',
      },
    },
  });

  assert.equal(cards.length, 1);
  const identityCard = cards[0];
  assert.equal(identityCard.id, 'identity-registry');
  assert.equal(identityCard.metrics.length, 2);
  assert.equal(identityCard.metrics[0].label, 'Agent ENS root');
  assert.equal(identityCard.metrics[0].value, 'agent.agi.eth');
});

