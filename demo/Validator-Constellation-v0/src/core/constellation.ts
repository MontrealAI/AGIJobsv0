import { randomBytes } from 'crypto';
import { keccak256, toUtf8Bytes } from 'ethers';
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
  DomainSafetyUpdate,
  DomainState,
  GovernanceParameters,
  Hex,
  JobResult,
  NodeIdentity,
  PauseRecord,
  RevealMessage,
  SentinelAlert,
  SlashingEvent,
  TreasuryDistributionEvent,
  ValidatorIdentity,
  VoteValue,
} from './types';

export interface DemoSetup {
  domains: DomainConfig[];
  governance: GovernanceParameters;
  ensLeaves: EnsLeaf[];
  verifyingKey: Hex;
  onChainEntropy: Hex;
  recentBeacon: Hex;
  sentinelGraceRatio: number;
  treasuryAddress: Hex;
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
  private readonly nodes: NodeIdentity[] = [];
  private readonly domainIds: string[];
  private readonly leaves: EnsLeaf[];
  private onChainEntropy: Hex;
  private recentBeacon: Hex;
  private blockNumber = 1;

  constructor(setup: DemoSetup) {
    this.leaves = setup.ensLeaves;
    const merkleRoot = buildMerkleRoot(this.leaves);
    this.ensAuthority = new EnsAuthority(merkleRoot);
    this.stakes = new StakeManager();
    this.stakes.setTreasuryAddress(setup.treasuryAddress);
    this.governance = new GovernanceModule(setup.governance);
    this.pauseController = new DomainPauseController(setup.domains);
    const opcodeMap = new Map<string, Set<string>>();
    const allowedTargetsMap = new Map<string, Set<string>>();
    const allowedTargetHashes = new Map<string, Set<string>>();
    const calldataLimits = new Map<string, number>();
    const selectorMap = new Map<string, Set<string>>();
    const normalizeTarget = (target: string) => target.toLowerCase();
    for (const domain of setup.domains) {
      opcodeMap.set(domain.id, domain.unsafeOpcodes);
      const normalizedTargets = new Set(Array.from(domain.allowedTargets, (target) => normalizeTarget(target)));
      allowedTargetsMap.set(domain.id, normalizedTargets);
      const hashedTargets = new Set(
        Array.from(normalizedTargets, (target) => keccak256(toUtf8Bytes(target))),
      );
      allowedTargetHashes.set(domain.id, hashedTargets);
      calldataLimits.set(domain.id, domain.maxCalldataBytes);
      selectorMap.set(domain.id, new Set(Array.from(domain.forbiddenSelectors, (selector) => selector.toLowerCase())));
    }
    this.sentinel = new SentinelMonitor(this.pauseController, {
      budgetGraceRatio: setup.sentinelGraceRatio,
      unsafeOpcodes: opcodeMap,
      allowedTargets: allowedTargetsMap,
      allowedTargetHashes,
      maxCalldataBytes: calldataLimits,
      forbiddenSelectors: selectorMap,
    });
    this.zk = new ZkBatchProver(setup.verifyingKey);
    this.commitReveal = new CommitRevealCoordinator(this.governance, this.stakes);
    this.domainIds = setup.domains.map((domain) => domain.id);
    this.onChainEntropy = setup.onChainEntropy;
    this.recentBeacon = setup.recentBeacon;
  }

  getTreasuryBalance(): bigint {
    return this.stakes.getTreasuryBalance();
  }

  getTreasuryAddress(): Hex {
    return this.stakes.getTreasuryAddress();
  }

  updateTreasuryAddress(address: Hex): Hex {
    this.stakes.setTreasuryAddress(address);
    return this.getTreasuryAddress();
  }

  distributeTreasury(recipient: Hex, amount: bigint): TreasuryDistributionEvent {
    return this.stakes.distributeTreasury(recipient, amount);
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
    return { ...identity };
  }

  registerAgent(ensName: string, address: Hex, domainId: string, budget: bigint): AgentIdentity {
    const proof = generateMerkleProof(this.leaves, { ensName, owner: address });
    const identity = this.ensAuthority.authorizeAgent({ ensName, address, proof }, domainId, budget);
    this.agents.push(identity);
    return { ...identity };
  }

  registerNode(ensName: string, address: Hex): NodeIdentity {
    const proof = generateMerkleProof(this.leaves, { ensName, owner: address });
    const identity = this.ensAuthority.authorizeNode({ ensName, address, proof });
    if (this.nodes.some((node) => node.address === identity.address)) {
      throw new Error(`node already registered: ${identity.address}`);
    }
    this.nodes.push(identity);
    return { ...identity };
  }

  findAgent(ensName: string): AgentIdentity | undefined {
    const agent = this.agents.find((candidate) => candidate.ensName === ensName);
    return agent ? { ...agent } : undefined;
  }

  findNode(ensName: string): NodeIdentity | undefined {
    const node = this.nodes.find((candidate) => candidate.ensName === ensName);
    return node ? { ...node } : undefined;
  }

  listValidators(): ValidatorIdentity[] {
    return this.validators.map((validator) => ({ ...validator }));
  }

  listNodes(): NodeIdentity[] {
    return this.nodes.map((node) => ({ ...node }));
  }

  blacklist(address: Hex): void {
    this.ensAuthority.ban(address);
  }

  pauseDomain(domainId: string, reason: string, triggeredBy = 'governance:manual'): PauseRecord {
    return this.pauseController.pause(domainId, reason, triggeredBy);
  }

  resumeDomain(domainId: string, triggeredBy = 'governance:manual'): PauseRecord {
    return this.pauseController.resume(domainId, triggeredBy);
  }

  getDomainState(domainId: string): DomainState {
    const state = this.pauseController.getState(domainId);
    return {
      config: {
        ...state.config,
        unsafeOpcodes: new Set(state.config.unsafeOpcodes),
        allowedTargets: new Set(state.config.allowedTargets),
        forbiddenSelectors: new Set(state.config.forbiddenSelectors),
      },
      paused: state.paused,
      pauseReason: state.pauseReason ? { ...state.pauseReason } : undefined,
    };
  }

  updateDomainSafety(domainId: string, updates: DomainSafetyUpdate): DomainConfig {
    const payload: Partial<Omit<DomainConfig, 'id'>> = {};
    if (updates.humanName !== undefined) {
      payload.humanName = updates.humanName;
    }
    if (updates.budgetLimit !== undefined) {
      payload.budgetLimit = updates.budgetLimit;
    }
    if (updates.unsafeOpcodes !== undefined) {
      payload.unsafeOpcodes = new Set(updates.unsafeOpcodes);
    }
    if (updates.allowedTargets !== undefined) {
      payload.allowedTargets = new Set(Array.from(updates.allowedTargets, (target) => target.toLowerCase()));
    }
    if (updates.maxCalldataBytes !== undefined) {
      payload.maxCalldataBytes = updates.maxCalldataBytes;
    }
    if (updates.forbiddenSelectors !== undefined) {
      payload.forbiddenSelectors = new Set(Array.from(updates.forbiddenSelectors, (selector) => selector.toLowerCase()));
    }
    const updated = this.pauseController.updateConfig(domainId, payload);
    if (updates.unsafeOpcodes) {
      this.sentinel.updateUnsafeOpcodes(domainId, updates.unsafeOpcodes);
    }
    if (updates.allowedTargets) {
      this.sentinel.updateAllowedTargets(domainId, updates.allowedTargets);
    }
    if (updates.maxCalldataBytes !== undefined) {
      this.sentinel.updateMaxCalldataBytes(domainId, updates.maxCalldataBytes);
    }
    if (updates.forbiddenSelectors) {
      this.sentinel.updateForbiddenSelectors(domainId, updates.forbiddenSelectors);
    }
    return {
      ...updated,
      unsafeOpcodes: new Set(updated.unsafeOpcodes),
      allowedTargets: new Set(updated.allowedTargets),
      forbiddenSelectors: new Set(updated.forbiddenSelectors),
    };
  }

  updateSentinelConfig(updates: { budgetGraceRatio?: number }): void {
    if (updates.budgetGraceRatio !== undefined) {
      this.sentinel.updateBudgetGraceRatio(updates.budgetGraceRatio);
    }
  }

  getSentinelBudgetGraceRatio(): number {
    return this.sentinel.getBudgetGraceRatio();
  }

  updateEntropySources(entropy: { onChainEntropy?: Hex; recentBeacon?: Hex }): { onChainEntropy: Hex; recentBeacon: Hex } {
    if (entropy.onChainEntropy) {
      this.onChainEntropy = entropy.onChainEntropy;
    }
    if (entropy.recentBeacon) {
      this.recentBeacon = entropy.recentBeacon;
    }
    return this.getEntropySources();
  }

  getEntropySources(): { onChainEntropy: Hex; recentBeacon: Hex } {
    return { onChainEntropy: this.onChainEntropy, recentBeacon: this.recentBeacon };
  }

  updateZkVerifyingKey(newKey: Hex): void {
    this.zk.setVerifyingKey(newKey);
  }

  getZkVerifyingKey(): Hex {
    return this.zk.getVerifyingKey();
  }

  setAgentBudget(ensName: string, newBudget: bigint): AgentIdentity {
    const idx = this.agents.findIndex((candidate) => candidate.ensName === ensName);
    if (idx === -1) {
      throw new Error(`unknown agent ${ensName}`);
    }
    const updated = { ...this.agents[idx], budget: newBudget };
    this.agents[idx] = updated;
    return { ...updated };
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
    nonRevealValidators?: Hex[];
  }): DemoOrchestrationReport {
    const activeValidators = this.stakes.listActive();
    const governanceParameters = this.governance.getParameters();
    const selection = selectCommittee(
      activeValidators,
      params.jobBatch[0]?.domainId ?? this.domainIds[0],
      params.round,
      governanceParameters,
      this.onChainEntropy,
      this.recentBeacon,
    );

    const slashingEvents: SlashingEvent[] = [];
    const sentinelAlerts: SentinelAlert[] = [];
    const commitMessages: CommitMessage[] = [];
    const revealMessages: RevealMessage[] = [];

    const commitStartBlock = this.blockNumber;
    const commitDeadlineBlock = commitStartBlock + governanceParameters.commitPhaseBlocks;

    const slashingListener = (event: SlashingEvent) => {
      slashingEvents.push(event);
    };
    const sentinelListener = (alert: SentinelAlert) => {
      sentinelAlerts.push(alert);
    };

    eventBus.on('StakeSlashed', slashingListener);
    eventBus.on('SentinelAlert', sentinelListener);

    try {
      this.commitReveal.openRound(params.round, selection.committee, {
        commitStartBlock,
        commitDeadlineBlock,
      });
      const votePlan = new Map<string, VotePlan>();
      for (const validator of selection.committee) {
        const vote = params.voteOverrides?.[validator.address] ?? params.truthfulVote;
        const salt = this.randomSalt();
        votePlan.set(validator.address, { vote, salt });
        const commitment = computeCommitment(vote, salt);
        const commitMessage: CommitMessage = {
          validator,
          commitment: commitment as Hex,
          round: params.round,
          submittedAtBlock: commitStartBlock,
          submittedAt: Date.now(),
        };
        this.commitReveal.submitCommit(params.round, commitMessage);
        commitMessages.push(commitMessage);
      }

      this.blockNumber = commitDeadlineBlock;
      const revealStartBlock = this.blockNumber;
      const revealDeadlineBlock = revealStartBlock + governanceParameters.revealPhaseBlocks;

      this.commitReveal.beginRevealPhase(params.round, revealStartBlock, revealDeadlineBlock);
      const nonRevealSet = new Set(params.nonRevealValidators ?? []);
      for (const validator of selection.committee) {
        if (nonRevealSet.has(validator.address)) {
          continue;
        }
        const plan = votePlan.get(validator.address)!;
        const reveal: RevealMessage = {
          validator,
          vote: plan.vote,
          salt: plan.salt,
          round: params.round,
          submittedAtBlock: revealStartBlock,
          submittedAt: Date.now(),
        };
        this.commitReveal.submitReveal(params.round, reveal);
        revealMessages.push(reveal);
      }

      this.blockNumber = revealDeadlineBlock;

      if (params.anomalies) {
        for (const anomaly of params.anomalies) {
          this.sentinel.observe(anomaly);
        }
      }

      const finalization = this.commitReveal.finalize(params.round, params.truthfulVote, this.blockNumber);
      const proof = this.zk.prove(params.jobBatch, params.committeeSignature);
      const verified = this.zk.verify(params.jobBatch, proof);
      if (!verified) {
        throw new Error('proof verification failed');
      }
      this.blockNumber = (finalization.timeline.revealDeadlineBlock ?? this.blockNumber) + 1;
      return {
        round: params.round,
        domainId: params.jobBatch[0]?.domainId ?? this.domainIds[0],
        committee: selection.committee,
        vrfSeed: selection.seed,
        vrfWitness: selection.witness,
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
        nodes: this.listNodes(),
        timeline: finalization.timeline,
        treasuryBalanceAfter: this.stakes.getTreasuryBalance(),
      };
    } finally {
      eventBus.off('StakeSlashed', slashingListener);
      eventBus.off('SentinelAlert', sentinelListener);
    }
  }
}
