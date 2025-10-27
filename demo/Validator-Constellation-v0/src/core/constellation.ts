import { randomBytes } from 'crypto';
import { eventBus } from './eventBus';
import { GovernanceModule } from './governance';
import { StakeManager } from './stakeManager';
import { selectCommittee } from './vrf';
import { CommitRevealCoordinator, computeCommitment } from './commitReveal';
import { DomainPauseController } from './domainPause';
import { SentinelMonitor } from './sentinel';
import { EnsAuthority } from './ensAuthority';
import { buildMerkleRoot, EnsLeaf, generateMerkleProof } from './ens';
import { ZkBatchProver } from './zk';
import './subgraph';
import {
  AgentAction,
  AgentIdentity,
  CommitMessage,
  DemoOrchestrationReport,
  DomainConfig,
  GovernanceParameters,
  Hex,
  JobResult,
  RevealMessage,
  SentinelAlert,
  SlashingEvent,
  ValidatorIdentity,
  VoteValue,
} from './types';

export interface DemoSetup {
  domains: DomainConfig[];
  governance: GovernanceParameters;
  ensLeaves: EnsLeaf[];
  verifyingKey: string;
  onChainEntropy: Hex;
  recentBeacon: Hex;
  sentinelGraceRatio: number;
}

interface VotePlan {
  vote: VoteValue;
  salt: Hex;
}

export class ValidatorConstellationDemo {
  private readonly governance: GovernanceModule;
  private readonly stakes: StakeManager;
  private readonly pauseController: DomainPauseController;
  private readonly sentinel: SentinelMonitor;
  private readonly ensAuthority: EnsAuthority;
  private readonly zk: ZkBatchProver;
  private readonly commitReveal: CommitRevealCoordinator;
  private readonly validators: ValidatorIdentity[] = [];
  private readonly agents: AgentIdentity[] = [];
  private readonly domainIds: string[];
  private readonly leaves: EnsLeaf[];

  constructor(private readonly setup: DemoSetup) {
    this.leaves = setup.ensLeaves;
    const merkleRoot = buildMerkleRoot(this.leaves);
    this.ensAuthority = new EnsAuthority(merkleRoot);
    this.stakes = new StakeManager();
    this.governance = new GovernanceModule(setup.governance);
    this.pauseController = new DomainPauseController(setup.domains);
    const opcodeMap = new Map<string, Set<string>>();
    for (const domain of setup.domains) {
      opcodeMap.set(domain.id, domain.unsafeOpcodes);
    }
    this.sentinel = new SentinelMonitor(this.pauseController, {
      budgetGraceRatio: setup.sentinelGraceRatio,
      unsafeOpcodes: opcodeMap,
    });
    this.zk = new ZkBatchProver(setup.verifyingKey);
    this.commitReveal = new CommitRevealCoordinator(this.governance, this.stakes);
    this.domainIds = setup.domains.map((domain) => domain.id);
  }

  getGovernance(): GovernanceParameters {
    return this.governance.getParameters();
  }

  updateGovernanceParameter(key: keyof GovernanceParameters, value: number): void {
    this.governance.updateParameter(key, value);
  }

  getStake(address: Hex) {
    return this.stakes.getAccount(address);
  }

  registerValidator(ensName: string, address: Hex, stake: bigint): ValidatorIdentity {
    const proof = generateMerkleProof(this.leaves, { ensName, owner: address });
    const identity = this.ensAuthority.authorizeValidator({ ensName, address, proof }, stake);
    this.validators.push(identity);
    this.stakes.registerValidator(identity);
    return identity;
  }

  registerAgent(ensName: string, address: Hex, domainId: string, budget: bigint): AgentIdentity {
    const proof = generateMerkleProof(this.leaves, { ensName, owner: address });
    const identity = this.ensAuthority.authorizeAgent({ ensName, address, proof }, domainId, budget);
    this.agents.push(identity);
    return identity;
  }

  findAgent(ensName: string): AgentIdentity | undefined {
    return this.agents.find((agent) => agent.ensName === ensName);
  }

  listValidators(): ValidatorIdentity[] {
    return [...this.validators];
  }

  private randomSalt(): Hex {
    return `0x${randomBytes(32).toString('hex')}`;
  }

  runValidationRound(params: {
    round: number;
    truthfulVote: VoteValue;
    jobBatch: JobResult[];
    committeeSignature: Hex;
    voteOverrides?: Record<string, VoteValue>;
    anomalies?: AgentAction[];
  }): DemoOrchestrationReport {
    const activeValidators = this.stakes.listActive();
    const selection = selectCommittee(
      activeValidators,
      params.jobBatch[0]?.domainId ?? this.domainIds[0],
      params.round,
      this.governance.getParameters(),
      this.setup.onChainEntropy,
      this.setup.recentBeacon,
    );

    const slashingEvents: SlashingEvent[] = [];
    const sentinelAlerts: SentinelAlert[] = [];
    const commitMessages: CommitMessage[] = [];
    const revealMessages: RevealMessage[] = [];

    const slashingListener = (event: SlashingEvent) => {
      slashingEvents.push(event);
    };
    const sentinelListener = (alert: SentinelAlert) => {
      sentinelAlerts.push(alert);
    };

    eventBus.on('StakeSlashed', slashingListener);
    eventBus.on('SentinelAlert', sentinelListener);

    try {
      this.commitReveal.openRound(params.round, selection.committee);
      const votePlan = new Map<string, VotePlan>();
      for (const validator of selection.committee) {
        const vote = params.voteOverrides?.[validator.address] ?? params.truthfulVote;
        const salt = this.randomSalt();
        votePlan.set(validator.address, { vote, salt });
        const commitment = computeCommitment(vote, salt);
        const commitMessage: CommitMessage = { validator, commitment: commitment as Hex, round: params.round };
        this.commitReveal.submitCommit(params.round, commitMessage);
        commitMessages.push(commitMessage);
      }

      this.commitReveal.beginRevealPhase(params.round);
      for (const validator of selection.committee) {
        const plan = votePlan.get(validator.address)!;
        const reveal: RevealMessage = {
          validator,
          vote: plan.vote,
          salt: plan.salt,
          round: params.round,
        };
        this.commitReveal.submitReveal(params.round, reveal);
        revealMessages.push(reveal);
      }

      if (params.anomalies) {
        for (const anomaly of params.anomalies) {
          const alert = this.sentinel.observe(anomaly);
          if (alert) {
            sentinelAlerts.push(alert);
          }
        }
      }

      const finalization = this.commitReveal.finalize(params.round, params.truthfulVote);
      const proof = this.zk.prove(params.jobBatch, params.committeeSignature);
      const verified = this.zk.verify(params.jobBatch, proof);
      if (!verified) {
        throw new Error('proof verification failed');
      }
      return {
        round: params.round,
        domainId: params.jobBatch[0]?.domainId ?? this.domainIds[0],
        committee: selection.committee,
        commits: commitMessages,
        reveals: revealMessages,
        voteOutcome: finalization.outcome,
        proof,
        sentinelAlerts,
        pauseRecords: this.pauseController.listDomains()
          .filter((state) => state.paused && state.pauseReason)
          .map((state) => state.pauseReason!)
          .sort((a, b) => a.timestamp - b.timestamp),
        slashingEvents,
      };
    } finally {
      eventBus.off('StakeSlashed', slashingListener);
      eventBus.off('SentinelAlert', sentinelListener);
    }
  }
}
