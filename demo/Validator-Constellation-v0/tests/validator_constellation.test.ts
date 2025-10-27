import assert from 'node:assert/strict';
import test from 'node:test';
import { assertAgentDomain, assertValidatorDomain, EnsLeaf } from '../src/core/ens';
import { ValidatorConstellationDemo } from '../src/core/constellation';
import { demoLeaves, demoSetup, demoJobBatch, budgetOverrunAction } from '../src/core/fixtures';
import { subgraphIndexer } from '../src/core/subgraph';
import { VoteValue } from '../src/core/types';

function buildDemo(): {
  demo: ValidatorConstellationDemo;
  leaves: EnsLeaf[];
} {
  const leaves = demoLeaves();
  const setup = demoSetup(leaves);
  const demo = new ValidatorConstellationDemo(setup);
  return { demo, leaves };
}

function orchestrateRound(): {
  roundResult: ReturnType<ValidatorConstellationDemo['runValidationRound']>;
  leaves: EnsLeaf[];
} {
  const { demo, leaves } = buildDemo();
  leaves.slice(0, 5).forEach((leaf) => demo.registerValidator(leaf.ensName, leaf.owner, 10_000_000_000_000_000_000n));
  const agentLeaf = leaves.find((leaf) => leaf.ensName === 'nova.agent.agi.eth');
  if (!agentLeaf) {
    throw new Error('missing agent leaf');
  }
  demo.registerAgent(agentLeaf.ensName, agentLeaf.owner, 'deep-space-lab', 1_000_000n);
  const jobBatch = demoJobBatch('deep-space-lab', 1000);
  const voteOverrides: Record<string, VoteValue> = {
    [leaves[1].owner]: 'REJECT',
  };
  const anomalies = [budgetOverrunAction(agentLeaf.ensName, agentLeaf.owner as `0x${string}`, 'deep-space-lab', 1_800_000n)];
  const roundResult = demo.runValidationRound({
    round: 1,
    truthfulVote: 'APPROVE',
    jobBatch,
    committeeSignature: '0x777788889999aaaabbbbccccddddeeeeffff0000111122223333444455556666',
    voteOverrides,
    anomalies,
  });
  return { roundResult, leaves };
}

test('ENS policies accept alpha mirrors and reject unauthorized domains', () => {
  assert.doesNotThrow(() => assertValidatorDomain('zephyr.alpha.club.agi.eth'));
  assert.doesNotThrow(() => assertAgentDomain('nova.alpha.agent.agi.eth'));
  assert.throws(() => assertValidatorDomain('rogue.validator.eth'));
});

test('validator constellation slashes dishonest validators via commit-reveal', () => {
  const { roundResult, leaves } = orchestrateRound();
  const slashedAddresses = new Set(roundResult.slashingEvents.map((event) => event.validator.address));
  assert.ok(slashedAddresses.has(leaves[1].owner), 'expected misbehaving validator to be slashed');
  assert.equal(roundResult.proof.attestedJobCount, 1000);
});

test('sentinel triggers domain pause on budget overrun', () => {
  const { roundResult } = orchestrateRound();
  assert.ok(roundResult.sentinelAlerts.length >= 1, 'expected sentinel alert');
  assert.ok(roundResult.pauseRecords.length >= 1, 'expected domain pause record');
  assert.equal(roundResult.pauseRecords[0]?.domainId, 'deep-space-lab');
});

test('subgraph indexer records slashing events for transparency', () => {
  subgraphIndexer.clear();
  const { roundResult } = orchestrateRound();
  const subgraphRecords = subgraphIndexer.filter('SLASHING');
  assert.ok(subgraphRecords.length >= roundResult.slashingEvents.length);
  assert.ok(
    subgraphRecords.some((record) => record.payload && (record.payload as { validator?: { address?: string } }).validator?.address === roundResult.slashingEvents[0]?.validator.address),
    'expected slashing event mirrored in subgraph',
  );
});

test('zk batch prover finalizes 1000 jobs with a single proof', () => {
  const { roundResult } = orchestrateRound();
  assert.equal(roundResult.proof.attestedJobCount, 1000);
  assert.ok(roundResult.proof.sealedOutput.startsWith('0x'));
});
