import { describe, expect, it } from 'vitest';
import { DomainController } from '../src/domain/domain-controller.js';
import { EnsRegistry } from '../src/identity/ens-registry.js';
import { Sentinel } from '../src/sentinel/sentinel.js';
import { AgentFactory } from '../src/simulation/agent-factory.js';
import { ValidationOrchestrator } from '../src/simulation/validation-orchestrator.js';

function setup() {
  const ensRegistry = new EnsRegistry([
    { name: 'athena.club.agi.eth', owner: '0x10', domainType: 'validator', domain: null },
    { name: 'poseidon.club.agi.eth', owner: '0x11', domainType: 'validator', domain: null },
    { name: 'hyperion.club.agi.eth', owner: '0x12', domainType: 'validator', domain: null },
    { name: 'clio.agent.agi.eth', owner: '0x20', domainType: 'agent', domain: 'research' },
  ]);
  const sentinel = new Sentinel({
    budgetOverrunThreshold: 10n,
    unsafeCallSignatures: ['delegatecall(bytes)'],
    slaBlocks: 1,
  });
  const domainController = new DomainController();
  const orchestrator = new ValidationOrchestrator(ensRegistry, sentinel, domainController, {
    validatorRegistry: { minimumStake: 5n, slashPenalty: 1n },
    commitReveal: { revealDeadlineBlocks: 10, quorum: 2, slashPenaltyReason: 'Penalty' },
    committee: { committeeSize: 2, entropyMix: 'entropy' },
    zkBatch: { maxBatchSize: 1000 },
  });
  return { ensRegistry, sentinel, domainController, orchestrator };
}

describe('ValidationOrchestrator', () => {
  it('runs a full validation round and produces a proof', () => {
    const { orchestrator, ensRegistry } = setup();
    orchestrator.registerValidator('0x10', 'athena.club.agi.eth', 10n);
    orchestrator.registerValidator('0x11', 'poseidon.club.agi.eth', 10n);
    orchestrator.registerValidator('0x12', 'hyperion.club.agi.eth', 10n);
    const agent = new AgentFactory(ensRegistry).createAgent('0x20', 'clio.agent.agi.eth', 'research', { budgetLimit: 6n });
    orchestrator.submitJobs([
      { jobId: 'job-1', domain: 'research', budget: 5n, metadata: { foo: 'bar' } },
      { jobId: 'job-2', domain: 'research', budget: 5n, metadata: { foo: 'baz' } },
    ]);
    orchestrator.executeJob('job-1', { profile: agent.profile }, true, 4n, 'call(bytes)');
    orchestrator.executeJob('job-2', { profile: agent.profile }, true, 4n, 'call(bytes)');
    const { proof, committee } = orchestrator.runValidationRound('round-1', ['job-1', 'job-2']);
    expect(proof.jobIds).toEqual(['job-1', 'job-2']);
    expect(committee.length).toBe(2);
  });

  it('triggers sentinel pause on anomaly', () => {
    const { orchestrator, ensRegistry, domainController } = setup();
    orchestrator.registerValidator('0x10', 'athena.club.agi.eth', 10n);
    orchestrator.registerValidator('0x11', 'poseidon.club.agi.eth', 10n);
    orchestrator.registerValidator('0x12', 'hyperion.club.agi.eth', 10n);
    const agent = new AgentFactory(ensRegistry).createAgent('0x20', 'clio.agent.agi.eth', 'research', { budgetLimit: 6n });
    orchestrator.submitJobs([{ jobId: 'job-1', domain: 'research', budget: 5n, metadata: { foo: 'bar' } }]);
    orchestrator.executeJob('job-1', { profile: agent.profile }, true, 11n, 'delegatecall(bytes)');
    expect(domainController.isPaused('research')).toBe(true);
  });
});
