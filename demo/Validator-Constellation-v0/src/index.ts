import { CommitRevealRound, RoundConfig, VoteValue, deriveCommit } from "./commitReveal/CommitReveal";
import { EnsRegistry, EnsRecord } from "./identity/EnsRegistry";
import { DomainPauseController } from "./pause/DomainPauseController";
import { budgetMonitor, forbiddenCallMonitor, Sentinel, AgentAction } from "./sentinel/Sentinel";
import { StakeManager } from "./staking/StakeManager";
import { EventBus } from "./subgraph/EventBus";
import { SubgraphIndexer } from "./subgraph/SubgraphIndexer";
import { ValidatorCandidate, VrfCommitteeSelector } from "./vrf/VrfCommittee";
import { BatchProof, JobResult, ZkBatchAttestor } from "./zk/ZkBatcher";

export interface ValidatorProfile {
  address: string;
  ensName: string;
  stake: bigint;
  domain: string;
}

export interface AgentProfile {
  address: string;
  ensName: string;
  domain: string;
  budget: number;
}

export interface NodeProfile {
  address: string;
  ensName: string;
  domain: string;
}

export interface DemoConfig {
  committeeSize: number;
  commitPhaseMs: number;
  revealPhaseMs: number;
  quorum: number;
  penaltyPercentage: number;
  sentinelSlaMs: number;
  spendingLimit: number;
}

export interface RoundExecutionOptions {
  malicious?: Record<string, "nonReveal" | "dishonest">;
  secretSalt?: Record<string, string>;
}

export interface RoundOutcome {
  proof: BatchProof;
  roundId: string;
  validators: ValidatorCandidate[];
  consensus: VoteValue;
  slashed: string[];
}

export class ValidatorConstellationDemo {
  readonly bus = new EventBus();
  readonly indexer = new SubgraphIndexer(this.bus);
  readonly ensRegistry: EnsRegistry;
  readonly pauseController = new DomainPauseController(this.bus);
  readonly sentinel: Sentinel;
  readonly stakeManager: StakeManager;
  readonly vrfSelector: VrfCommitteeSelector;
  readonly zkBatcher: ZkBatchAttestor;

  private readonly validators = new Map<string, ValidatorProfile>();
  private readonly agents = new Map<string, AgentProfile>();
  private readonly nodes = new Map<string, NodeProfile>();

  constructor(private readonly config: DemoConfig, ensRecords: EnsRecord[]) {
    this.ensRegistry = new EnsRegistry(ensRecords);
    this.stakeManager = new StakeManager(this.bus);
    this.sentinel = new Sentinel(this.bus, this.pauseController, config.sentinelSlaMs);
    this.sentinel.registerMonitor("budget", budgetMonitor(config.spendingLimit));
    this.sentinel.registerMonitor("forbidden", forbiddenCallMonitor());
    this.vrfSelector = new VrfCommitteeSelector(config.committeeSize);
    this.zkBatcher = new ZkBatchAttestor(this.bus);
  }

  registerValidator(profile: ValidatorProfile): void {
    this.ensRegistry.assertAuthorised(profile.address, profile.ensName, "validator");
    this.validators.set(profile.address, profile);
    this.stakeManager.deposit(profile.address, profile.stake);
    this.bus.emit("ValidatorRegistered", { address: profile.address, ens: profile.ensName, stake: profile.stake.toString() });
  }

  registerAgent(profile: AgentProfile): void {
    this.ensRegistry.assertAuthorised(profile.address, profile.ensName, "agent");
    this.agents.set(profile.address, profile);
  }

  registerNode(profile: NodeProfile): void {
    this.ensRegistry.assertAuthorised(profile.address, profile.ensName, "node");
    this.nodes.set(profile.address, profile);
  }

  dispatchAgentAction(action: AgentAction): void {
    const agent = this.agents.get(action.agent);
    if (!agent) {
      throw new Error(`Unknown agent ${action.agent}`);
    }
    if (agent.domain !== action.domain) {
      throw new Error(`Agent ${agent.ensName} cannot operate in domain ${action.domain}`);
    }
    const node = this.nodes.get(action.node);
    if (!node) {
      throw new Error(`Unknown node ${action.node}`);
    }
    if (node.domain !== action.domain) {
      throw new Error(`Node ${node.ensName} cannot operate in domain ${action.domain}`);
    }
    this.sentinel.evaluate(action);
  }

  runValidationRound(
    roundId: string,
    seed: string,
    jobResults: JobResult[],
    truth: VoteValue,
    options: RoundExecutionOptions = {},
  ): RoundOutcome {
    const committee = this.formCommittee(seed);
    const now = Date.now();
    const roundConfig: RoundConfig = {
      roundId,
      validators: committee.map((member) => member.address),
      commitDeadline: now + this.config.commitPhaseMs,
      revealDeadline: now + this.config.commitPhaseMs + this.config.revealPhaseMs,
      quorum: this.config.quorum,
      penaltyPercentage: this.config.penaltyPercentage,
    };
    const round = new CommitRevealRound(roundConfig, this.stakeManager, this.bus);
    for (const member of committee) {
      const behaviour = options.malicious?.[member.address];
      const salt = options.secretSalt?.[member.address] ?? `${roundId}:${member.address}`;
      const vote = behaviour === "dishonest" ? (truth === "approve" ? "reject" : "approve") : truth;
      round.commit(member.address, vote, salt, now + 1);
    }
    round.advancePhase(roundConfig.commitDeadline + 1);
    for (const member of committee) {
      const behaviour = options.malicious?.[member.address];
      if (behaviour === "nonReveal") {
        continue;
      }
      const salt = options.secretSalt?.[member.address] ?? `${roundId}:${member.address}`;
      const vote = behaviour === "dishonest" ? (truth === "approve" ? "reject" : "approve") : truth;
      round.reveal(member.address, vote, salt, now + this.config.commitPhaseMs + 1);
    }
    round.advancePhase(roundConfig.revealDeadline + 1);
    const result = round.finalize(truth);
    const proof = this.zkBatcher.buildProof(jobResults, `${roundId}-proof-secret`);
    return { proof, roundId, validators: committee, consensus: truth, slashed: result.slashed };
  }

  private formCommittee(seed: string): ValidatorCandidate[] {
    const candidates = Array.from(this.validators.values()).map(
      (validator) =>
        ({
          address: validator.address,
          ensName: validator.ensName,
          stake: this.stakeManager.balanceOf(validator.address),
        }) satisfies ValidatorCandidate,
    );
    return this.vrfSelector.select(seed, candidates).selected;
  }
}

export { deriveCommit };
export type { BatchProof, JobResult };
