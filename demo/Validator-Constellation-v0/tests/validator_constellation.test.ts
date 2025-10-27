import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { keccak256, toUtf8Bytes } from 'ethers';
import { assertAgentDomain, assertValidatorDomain, EnsLeaf } from '../src/core/ens';
import { ValidatorConstellationDemo } from '../src/core/constellation';
import { CommitRevealCoordinator, computeCommitment } from '../src/core/commitReveal';
import { GovernanceModule } from '../src/core/governance';
import { StakeManager } from '../src/core/stakeManager';
import { DEFAULT_GOVERNANCE_PARAMETERS, demoLeaves, demoSetup, demoJobBatch, budgetOverrunAction } from '../src/core/fixtures';
import { subgraphIndexer } from '../src/core/subgraph';
import { selectCommittee } from '../src/core/vrf';
import { computeJobRoot } from '../src/core/zk';
import {
  buildDemoFromOperatorState,
  createInitialOperatorState,
  formatValidatorStake,
  generateOperatorMermaid,
  refreshStateFromDemo,
} from '../src/core/operatorState';
import { loadScenarioConfig, prepareScenario, executeScenario } from '../src/core/scenario';
import { AgentAction, Hex, VoteValue, ValidatorIdentity } from '../src/core/types';

function buildDemo(): {
  demo: ValidatorConstellationDemo;
  leaves: EnsLeaf[];
} {
  const leaves = demoLeaves();
  const setup = demoSetup(leaves);
  const demo = new ValidatorConstellationDemo(setup);
  return { demo, leaves };
}

test('commit-reveal timeline enforces governance block windows', () => {
  const governance = new GovernanceModule(DEFAULT_GOVERNANCE_PARAMETERS);
  const stakes = new StakeManager();
  const coordinator = new CommitRevealCoordinator(governance, stakes);
  const validator: ValidatorIdentity = {
    address: '0x9999999999999999999999999999999999999999',
    ensName: 'rigel.club.agi.eth',
    stake: 5n,
  };
  stakes.registerValidator(validator);
  const round = 42;
  coordinator.openRound(round, [validator], { commitStartBlock: 120, commitDeadlineBlock: 124 });
  const salt = '0xdeadbeefcafebabe' as Hex;
  const commitment = computeCommitment('APPROVE', salt);
  assert.throws(
    () =>
      coordinator.submitCommit(round, {
        validator,
        commitment: commitment as Hex,
        round,
        submittedAtBlock: 119,
        submittedAt: Date.now(),
      }),
    /commit window opened/,
  );
  coordinator.submitCommit(round, {
    validator,
    commitment: commitment as Hex,
    round,
    submittedAtBlock: 122,
    submittedAt: Date.now(),
  });
  assert.throws(() => coordinator.beginRevealPhase(round, 123, 130), /commit window still open/);
  coordinator.beginRevealPhase(round, 124, 130);
  assert.throws(
    () =>
      coordinator.submitReveal(round, {
        validator,
        vote: 'APPROVE',
        salt,
        round,
        submittedAtBlock: 123,
        submittedAt: Date.now(),
      }),
    /reveal window opened/,
  );
  coordinator.submitReveal(round, {
    validator,
    vote: 'APPROVE',
    salt,
    round,
    submittedAtBlock: 125,
    submittedAt: Date.now(),
  });
  assert.throws(() => coordinator.finalize(round, 'APPROVE', 131), /reveal window closed/);
  const timelineResult = coordinator.finalize(round, 'APPROVE', 130);
  assert.equal(timelineResult.timeline.commitStartBlock, 120);
  assert.equal(timelineResult.timeline.commitDeadlineBlock, 124);
  assert.equal(timelineResult.timeline.revealStartBlock, 124);
  assert.equal(timelineResult.timeline.revealDeadlineBlock, 130);
});

function orchestrateRound(): {
  roundResult: ReturnType<ValidatorConstellationDemo['runValidationRound']>;
  leaves: EnsLeaf[];
  dishonest?: ValidatorIdentity;
  absentee?: ValidatorIdentity;
} {
  const { demo, leaves } = buildDemo();
  leaves.slice(0, 5).forEach((leaf) => demo.registerValidator(leaf.ensName, leaf.owner, 10_000_000_000_000_000_000n));
  const agentLeaf = leaves.find((leaf) => leaf.ensName === 'nova.agent.agi.eth');
  if (!agentLeaf) {
    throw new Error('missing agent leaf');
  }
  demo.registerAgent(agentLeaf.ensName, agentLeaf.owner, 'deep-space-lab', 1_000_000n);
  const round = 1;
  const domainId = 'deep-space-lab';
  const entropy = demo.getEntropySources();
  const committeeSelection = selectCommittee(
    demo.listValidators(),
    domainId,
    round,
    demo.getGovernance(),
    entropy.onChainEntropy,
    entropy.recentBeacon,
  );
  const dishonest = committeeSelection.committee[0];
  const absentee = committeeSelection.committee[1];
  const voteOverrides: Record<string, VoteValue> = dishonest
    ? {
        [dishonest.address]: 'REJECT',
      }
    : {};
  const nonRevealValidators = absentee ? [absentee.address] : [];
  const jobBatch = demoJobBatch(domainId, 1000);
  const anomalies = [budgetOverrunAction(agentLeaf.ensName, agentLeaf.owner as `0x${string}`, 'deep-space-lab', 1_800_000n)];
  const roundResult = demo.runValidationRound({
    round,
    truthfulVote: 'APPROVE',
    jobBatch,
    committeeSignature: '0x777788889999aaaabbbbccccddddeeeeffff0000111122223333444455556666',
    voteOverrides,
    nonRevealValidators,
    anomalies,
  });
  return { roundResult, leaves, dishonest, absentee };
}

test('ENS policies accept alpha mirrors and reject unauthorized domains', () => {
  assert.doesNotThrow(() => assertValidatorDomain('zephyr.alpha.club.agi.eth'));
  assert.doesNotThrow(() => assertAgentDomain('nova.alpha.agent.agi.eth'));
  assert.throws(() => assertValidatorDomain('rogue.validator.eth'));
});

test('validator constellation slashes dishonest validators via commit-reveal', () => {
  const { roundResult, dishonest, absentee } = orchestrateRound();
  const slashedAddresses = new Set(roundResult.slashingEvents.map((event) => event.validator.address));
  if (dishonest) {
    assert.ok(slashedAddresses.has(dishonest.address), 'expected dishonest validator to be slashed');
  }
  if (absentee) {
    assert.ok(slashedAddresses.has(absentee.address), 'expected absentee validator to be slashed');
  }
  assert.equal(roundResult.proof.attestedJobCount, 1000);
  assert.ok(roundResult.vrfSeed.startsWith('0x'), 'expected VRF seed in report');
  const timeline = roundResult.timeline;
  assert.equal(timeline.commitDeadlineBlock, timeline.commitStartBlock + DEFAULT_GOVERNANCE_PARAMETERS.commitPhaseBlocks);
  assert.equal(timeline.revealStartBlock, timeline.commitDeadlineBlock);
  assert.equal(
    timeline.revealDeadlineBlock,
    (timeline.revealStartBlock ?? 0) + DEFAULT_GOVERNANCE_PARAMETERS.revealPhaseBlocks,
  );
  assert.ok(roundResult.audit.pass, 'audit report should pass');
  assert.ok(roundResult.audit.crossChecks.proofIntegrity, 'audit must confirm proof integrity');
  assert.ok(roundResult.audit.crossChecks.vrfIntegrity, 'audit must confirm VRF integrity');
  assert.equal(roundResult.audit.metrics.attestedJobs, 1000);
});

test('sentinel triggers domain pause on budget overrun', () => {
  const { roundResult } = orchestrateRound();
  assert.ok(roundResult.sentinelAlerts.length >= 1, 'expected sentinel alert');
  assert.ok(roundResult.pauseRecords.length >= 1, 'expected domain pause record');
  assert.equal(roundResult.pauseRecords[0]?.domainId, 'deep-space-lab');
  assert.ok(roundResult.audit.crossChecks.sentinelIntegrity, 'audit must confirm sentinel coverage');
});

test('autonomous audit validates quorum and sentinel guardrails', () => {
  const { roundResult } = orchestrateRound();
  const audit = roundResult.audit;
  assert.ok(audit.metrics.quorumAchieved, 'quorum should be achieved');
  assert.ok(audit.crossChecks.commitIntegrity, 'commit integrity should hold');
  assert.ok(audit.crossChecks.timelineIntegrity, 'timeline should satisfy governance window');
  if (roundResult.sentinelAlerts.length > 0) {
    assert.ok(audit.crossChecks.sentinelIntegrity, 'sentinel alerts must map to domain pauses');
  }
  assert.ok(audit.findings.every((finding) => finding.severity !== 'CRITICAL'));
});

test('governance can rotate entropy mix and ZK verifying key for ultimate owner control', () => {
  const { demo, leaves } = buildDemo();
  leaves.slice(0, 5).forEach((leaf) => demo.registerValidator(leaf.ensName, leaf.owner, 10_000_000_000_000_000_000n));
  const agentLeaf = leaves.find((leaf) => leaf.ensName === 'nova.agent.agi.eth');
  if (!agentLeaf) {
    throw new Error('missing agent leaf');
  }
  demo.registerAgent(agentLeaf.ensName, agentLeaf.owner, 'deep-space-lab', 1_000_000n);

  const originalEntropy = demo.getEntropySources();
  const rotatedKey: Hex = '0xabababababababababababababababababababababababababababababababababab' as Hex;
  demo.updateZkVerifyingKey(rotatedKey);
  const entropyUpdate = demo.updateEntropySources({
    onChainEntropy: '0x111122223333444455556666777788889999aaaabbbbccccddddeeeeffff0000' as Hex,
    recentBeacon: '0xffffeeeeccccaaaabbbb9999888877776666555544443333222211110000ffff' as Hex,
  });

  const jobBatch = demoJobBatch('deep-space-lab', 8);
  const round = 11;
  const committeeSignature: Hex = '0x1234123412341234123412341234123412341234123412341234123412341234' as Hex;
  const result = demo.runValidationRound({
    round,
    truthfulVote: 'APPROVE',
    jobBatch,
    committeeSignature,
  });

  const jobRoot = computeJobRoot(jobBatch);
  const expectedWitness = keccak256(toUtf8Bytes(`${jobRoot}:${rotatedKey}`));
  assert.equal(result.proof.witnessCommitment, expectedWitness);
  assert.equal(demo.getZkVerifyingKey(), rotatedKey);

  const selection = selectCommittee(
    demo.listValidators(),
    'deep-space-lab',
    round,
    demo.getGovernance(),
    entropyUpdate.onChainEntropy,
    entropyUpdate.recentBeacon,
  );

  assert.equal(result.vrfSeed, selection.seed);
  assert.deepEqual(
    result.committee.map((member) => member.address),
    selection.committee.map((member) => member.address),
  );
  assert.deepEqual(demo.getEntropySources(), entropyUpdate);
  assert.notDeepEqual(entropyUpdate, originalEntropy);
  assert.ok(result.audit.pass, 'audit should pass after governance updates');
});

test('node orchestration enforces ENS lineage and blacklist controls', () => {
  const { demo, leaves } = buildDemo();
  const polaris = leaves.find((leaf) => leaf.ensName === 'polaris.node.agi.eth');
  const selene = leaves.find((leaf) => leaf.ensName === 'selene.alpha.node.agi.eth');
  if (!polaris || !selene) {
    throw new Error('missing node leaves');
  }
  const registeredPolaris = demo.registerNode(polaris.ensName, polaris.owner);
  const registeredSelene = demo.registerNode(selene.ensName, selene.owner);
  assert.equal(registeredPolaris.ensName, 'polaris.node.agi.eth');
  assert.equal(registeredSelene.ensName, 'selene.alpha.node.agi.eth');
  assert.equal(demo.listNodes().length, 2);
  assert.throws(() => demo.registerNode('rogue.node.eth', polaris.owner));
  demo.blacklist(polaris.owner as `0x${string}`);
  assert.throws(() => demo.registerNode(polaris.ensName, polaris.owner), /blacklisted/);
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

test('governance controls allow dynamic guardrail tuning for non-technical owners', () => {
  const { demo, leaves } = buildDemo();
  leaves.slice(0, 5).forEach((leaf) => demo.registerValidator(leaf.ensName, leaf.owner, 10_000_000_000_000_000_000n));
  const agentLeaf = leaves.find((leaf) => leaf.ensName === 'nova.agent.agi.eth');
  if (!agentLeaf) {
    throw new Error('missing agent leaf');
  }
  demo.registerAgent(agentLeaf.ensName, agentLeaf.owner, 'deep-space-lab', 1_000_000n);
  const pauseRecord = demo.pauseDomain('deep-space-lab', 'manual audit');
  assert.equal(demo.getDomainState('deep-space-lab').paused, true);
  demo.resumeDomain('deep-space-lab');
  assert.equal(demo.getDomainState('deep-space-lab').paused, false);
  demo.updateDomainSafety('deep-space-lab', { unsafeOpcodes: ['STATICCALL', 'DELEGATECALL'] });
  demo.updateSentinelConfig({ budgetGraceRatio: 0.2 });
  const controlledAgent = demo.setAgentBudget(agentLeaf.ensName, 2_000_000n);
  assert.equal(demo.getSentinelBudgetGraceRatio(), 0.2);
  assert.equal(demo.findAgent(agentLeaf.ensName)?.budget, 2_000_000n);
  assert.ok(pauseRecord.reason.includes('manual audit'));

  const jobBatch = demoJobBatch('deep-space-lab', 64);
  const anomalies: AgentAction[] = [
    budgetOverrunAction(controlledAgent.ensName, controlledAgent.address, 'deep-space-lab', 2_100_000n, controlledAgent.budget),
    {
      agent: { ...controlledAgent },
      domainId: 'deep-space-lab',
      type: 'CALL' as const,
      amountSpent: 1_000n,
      opcode: 'STATICCALL',
      description: 'runtime policy breach',
    },
  ];

  const result = demo.runValidationRound({
    round: 7,
    truthfulVote: 'APPROVE',
    jobBatch,
    committeeSignature: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    anomalies,
  });

  const rules = new Set(result.sentinelAlerts.map((alert) => alert.rule));
  assert.ok(rules.has('UNSAFE_OPCODE'), 'expected unsafe opcode alert after domain policy update');
  assert.ok(!rules.has('BUDGET_OVERRUN'), 'budget grace ratio update should prevent overspend alert');
  assert.ok(result.audit.pass, 'audit should pass after guardrail tuning');
});

test('configuration-driven scenario empowers non-technical orchestration', () => {
  subgraphIndexer.clear();
  const scenarioPath = path.join(__dirname, '..', 'config', 'stellar-scenario.yaml');
  const config = loadScenarioConfig(scenarioPath);
  const prepared = prepareScenario(config);
  const executed = executeScenario(prepared);
  assert.equal(executed.report.proof.attestedJobCount, 256);
  assert.ok(executed.report.sentinelAlerts.length >= 1, 'scenario should emit sentinel alerts');
  assert.ok(executed.report.slashingEvents.length >= 1, 'scenario should trigger slashing telemetry');
  assert.equal(executed.context.primaryDomain.config.id, 'deep-space-lab');
  assert.equal(executed.context.sentinelGraceRatio, 0.12);
  assert.equal(executed.context.nodesRegistered.length, 2);
  assert.equal(executed.context.verifyingKey, '0xf1f2f3f4f5f6f7f8f9fafbfcfdfeff00112233445566778899aabbccddeeff0011');
  assert.equal(executed.context.jobSample?.length, 8);
  assert.ok(executed.context.ownerNotes?.description);
  assert.ok(executed.report.audit.pass, 'scenario audit should pass');
});

test('operator control tower state synchronizes sentinel pauses and slashing telemetry', () => {
  const state = createInitialOperatorState();
  const demo = buildDemoFromOperatorState(state);
  const domainId = 'deep-space-lab';
  const agent = state.agents.find((candidate) => candidate.domainId === domainId);
  if (!agent) {
    throw new Error('missing control tower agent');
  }
  const entropy = demo.getEntropySources();
  const selection = selectCommittee(
    demo.listValidators(),
    domainId,
    9,
    demo.getGovernance(),
    entropy.onChainEntropy,
    entropy.recentBeacon,
  );
  const jobBatch = demoJobBatch(domainId, 64);
  const voteOverrides: Record<string, VoteValue> = selection.committee[0]
    ? { [selection.committee[0].address]: 'REJECT' }
    : {};
  const nonReveal = selection.committee[1] ? [selection.committee[1].address] : [];
  const anomalies: AgentAction[] = [
    budgetOverrunAction(agent.ensName, agent.address, domainId, 1_800_000n, BigInt(agent.budget)),
  ];
  const roundResult = demo.runValidationRound({
    round: 9,
    truthfulVote: 'APPROVE',
    jobBatch,
    committeeSignature: '0x9999888877776666555544443333222211110000aaaabbbbccccddddeeeeffff',
    voteOverrides,
    nonRevealValidators: nonReveal,
    anomalies,
  });
  refreshStateFromDemo(state, demo, { slashingEvents: roundResult.slashingEvents });
  const domain = state.domains.find((candidate) => candidate.id === domainId);
  assert.ok(domain?.paused, 'domain should be paused after sentinel anomaly');
  assert.ok(roundResult.slashingEvents.length >= 1, 'round should emit slashing events');
  for (const event of roundResult.slashingEvents) {
    const validator = state.validators.find((candidate) => candidate.address === event.validator.address);
    assert.ok(validator, 'validator from slashing event should exist in state');
    assert.notEqual(validator?.stake, '10000000000000000000', 'stake should reflect penalty');
  }
  assert.ok(roundResult.audit.crossChecks.vrfIntegrity, 'audit should track VRF integrity in control tower run');
});

test('operator mermaid blueprint captures governance posture', () => {
  const state = createInitialOperatorState();
  const mermaid = generateOperatorMermaid(state);
  assert.ok(mermaid.includes('Validators'));
  assert.ok(mermaid.includes('Deep Space Research Lab'));
  assert.ok(mermaid.includes('Sentinel'));
  assert.ok(formatValidatorStake('10000000000000000000').includes('ETH'));
});
