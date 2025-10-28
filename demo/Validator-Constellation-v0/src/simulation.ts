import {
  AgentIdentity,
  Domain,
  EpochEntropy,
  JobResult,
  OperatorConsoleSnapshot,
  SimulationReport,
  ValidatorIdentity,
  NodeIdentity,
} from './types';
import { agentConfig, domainBudgets, nodeEnsRoots, validatorConfig } from './config';
import { enforceAgentIdentity, enforceValidatorIdentity, enforceNodeIdentity } from './ens';
import { VrfCommitteeOracle } from './vrf';
import { CommitRevealRound } from './commitReveal';
import { SentinelMesh } from './sentinel';
import { DomainPauseManager } from './domainPause';
import { StakeManager } from './slashing';
import { ZkBatchProcessor } from './zkBatch';
import { mixEntropy, randomHex } from './utils';

export interface SimulationInput {
  epochEntropy: EpochEntropy;
  validators: ValidatorIdentity[];
  agents: AgentIdentity[];
  jobs: JobResult[];
  nodes: NodeIdentity[];
  governanceAddress: string;
}

export class ValidatorConstellationSimulation {
  private readonly sentinel = new SentinelMesh();
  private readonly pauseManager = new DomainPauseManager();
  private readonly stakeManager = new StakeManager();
  private readonly zkProcessor = new ZkBatchProcessor();

  constructor(private readonly input: SimulationInput) {}

  run(): SimulationReport {
    this.validateIdentities();

    const committee = this.selectCommittee();
    const round = new CommitRevealRound(this.input.jobs[0], Date.now());

    const commitments = committee.map((validator) =>
      round.commit(validator, 'truth', randomHex(16)),
    );

    // simulate reveals – some may fail to reveal to trigger slashing
    const reveals = commitments
      .map((commitment, index) => {
        if (index === commitments.length - 1) {
          return commitment; // this validator will fail to reveal and get slashed
        }
        return round.reveal(commitment, 'truth');
      })
      .filter((commitment) => commitment.revealed);

    const slashedValidators = commitments
      .filter((commitment) => !commitment.revealed)
      .map((commitment) => this.stakeManager.slash(commitment, 'Reveal missed window').validator);

    const alerts = this.evaluateSentinels();

    const pausedDomains = alerts
      .filter((alert) => alert.severity === 'critical')
      .map((alert) => this.pauseManager.pauseFromAlert(alert).domain);

    const resumedDomains: Domain[] = pausedDomains
      .map((domain) => this.pauseManager.resume(domain, this.input.governanceAddress)?.domain)
      .filter((domain): domain is Domain => Boolean(domain));

    const zkBatch = this.zkProcessor.verify(this.zkProcessor.createBatch(this.input.jobs));

    return {
      committee,
      commitments,
      reveals,
      slashedValidators,
      alerts,
      pausedDomains,
      resumedDomains,
      zkBatch,
    };
  }

  operatorSnapshot(): OperatorConsoleSnapshot {
    const latestBatch = this.zkProcessor.verify(this.zkProcessor.createBatch(this.input.jobs));
    return {
      epoch: this.input.epochEntropy.epoch,
      pausedDomains: this.pauseManager.getHistory(),
      validatorHealth: this.input.validators.map((validator) => ({
        ens: validator.ens,
        stake: validator.stake,
        misbehaviourCount: validator.misbehaviourCount,
      })),
      outstandingAlerts: this.sentinel.getAlerts(),
      latestBatch,
      nodeRoster: this.input.nodes.map((node) => ({ ens: node.ens, domain: node.domain })),
    };
  }

  private validateIdentities(): void {
    const validatorBlacklist = new Set<string>();
    const agentBlacklist = new Set<string>();
    const nodeBlacklist = new Set<string>();

    this.input.validators.forEach((validator) => enforceValidatorIdentity(validator, validatorConfig, validatorBlacklist));
    this.input.agents.forEach((agent) => {
      enforceAgentIdentity(agent, agentConfig, agentBlacklist);
      const domainBudget = domainBudgets[agent.domain];
      if (agent.spendingLimit > domainBudget) {
        throw new Error(`Agent ${agent.ens} spending limit exceeds domain budget.`);
      }
    });
    this.input.nodes.forEach((node) => enforceNodeIdentity(node, nodeEnsRoots, nodeBlacklist));
  }

  private selectCommittee(): ValidatorIdentity[] {
    const oracle = new VrfCommitteeOracle(this.input.epochEntropy, this.input.validators);
    return oracle.selectCommittee();
  }

  private evaluateSentinels(): ReturnType<SentinelMesh['getAlerts']> {
    this.sentinel.clear();
    this.input.jobs.forEach((job) => {
      const agent = this.input.agents.find((candidate) => candidate.domain === job.domain);
      if (!agent) {
        throw new Error(`Missing agent for domain ${job.domain}`);
      }
      this.sentinel.evaluate(job, agent);
    });
    return this.sentinel.getAlerts();
  }
}

export function buildSimulationInput(epoch: number): SimulationInput {
  const validators: ValidatorIdentity[] = Array.from({ length: 7 }).map((_, index) => ({
    address: `0xvalidator${index.toString().padStart(2, '0')}`,
    ens: `validator-${index}.club.agi.eth`,
    stake: 200n * 10n ** 18n,
    active: true,
    misbehaviourCount: 0,
  }));

  const agents: AgentIdentity[] = [
    {
      address: '0xagent00',
      ens: 'orion.agent.agi.eth',
      domain: 'research.alpha',
      spendingLimit: domainBudgets['research.alpha'],
    },
    {
      address: '0xagent01',
      ens: 'helix.agent.agi.eth',
      domain: 'operations.main',
      spendingLimit: domainBudgets['operations.main'],
    },
    {
      address: '0xagent02',
      ens: 'atlas.agent.agi.eth',
      domain: 'marketplace.main',
      spendingLimit: domainBudgets['marketplace.main'],
    },
  ];

  const nodes: NodeIdentity[] = [
    { address: '0xnode00', ens: 'apollo.node.agi.eth', domain: 'research.alpha' },
    { address: '0xnode01', ens: 'stride.node.agi.eth', domain: 'operations.main' },
    { address: '0xnode02', ens: 'orbit.node.agi.eth', domain: 'marketplace.main' },
  ];

  const jobs: JobResult[] = Array.from({ length: 1000 }).map((_, index) => {
    const domain = (index % 3 === 0
      ? 'research.alpha'
      : index % 3 === 1
        ? 'operations.main'
        : 'marketplace.main') as Domain;
    const baseHash = mixEntropy([`job-${epoch}-${index}`, domain]);
    return {
      jobId: `job-${epoch}-${index}`,
      domain,
      outcome: 'success',
      proofHash: index === 42 ? `${baseHash}-deadbeef` : baseHash,
      rewardWei: index === 42 ? domainBudgets[domain] + 1n : 2n * 10n ** 18n,
    };
  });

  return {
    epochEntropy: {
      epoch,
      seed: mixEntropy([`epoch-${epoch}`, randomHex(32)]),
    },
    validators,
    agents,
    jobs,
    nodes,
    governanceAddress: '0xowner',
  };
}
