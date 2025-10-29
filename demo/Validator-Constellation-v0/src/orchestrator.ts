import { CommitRevealRound, RoundConfiguration } from "./commitReveal";
import { DomainPauseManager } from "./domainPause";
import { EnsOwnershipRegistry, buildAgentProfile, buildValidatorProfile } from "./ens";
import { SentinelMonitor, SentinelConfig, ExecutionEvent } from "./sentinel";
import { StakeManager } from "./staking";
import { BatchConfig, ZkBatchVerifier } from "./zkBatch";
import { DeterministicVrf } from "./vrf";
import { Address, JobResult, ValidatorProfile } from "./types";

export interface DemoConfig {
  round: RoundConfiguration;
  sentinel: SentinelConfig;
  batch: BatchConfig;
}

export class ValidatorConstellationDemo {
  readonly ensRegistry = new EnsOwnershipRegistry();
  readonly stakeManager = new StakeManager();
  readonly pauseManager = new DomainPauseManager();
  sentinel: SentinelMonitor;
  zkVerifier: ZkBatchVerifier;
  readonly vrf = new DeterministicVrf();

  private agents = new Map<Address, ReturnType<typeof buildAgentProfile>>();

  constructor(private config: DemoConfig) {
    this.sentinel = new SentinelMonitor(config.sentinel, this.pauseManager);
    this.zkVerifier = new ZkBatchVerifier(config.batch);
  }

  onboardValidator(address: Address, ensName: string, stake: bigint) {
    if (!this.ensRegistry.verify(ensName, address, "validator")) {
      throw new Error("ENS ownership verification failed");
    }
    const profile = buildValidatorProfile(address, ensName, stake);
    this.stakeManager.registerValidator(profile);
  }

  onboardAgent(address: Address, ensName: string) {
    if (!this.ensRegistry.verify(ensName, address, "agent")) {
      throw new Error("ENS ownership verification failed for agent");
    }
    const profile = buildAgentProfile(address, ensName);
    this.agents.set(address.toLowerCase(), profile);
  }

  runRound(roundId: string): CommitRevealRound {
    const validators = this.stakeManager.listActive();
    if (validators.length < this.config.round.committeeSize) {
      throw new Error("Not enough validators");
    }
    const round = new CommitRevealRound(roundId, validators, this.vrf, this.config.round);
    return round;
  }

  submitCommit(round: CommitRevealRound, validator: Address, vote: boolean, salt: string) {
    const commitment = round.hashVote(vote, salt);
    round.commitVote(validator, commitment);
  }

  submitReveal(round: CommitRevealRound, validator: Address, vote: boolean, salt: string, truthful: boolean) {
    try {
      round.revealVote(validator, truthful ? vote : !vote, salt);
    } catch (error) {
      this.stakeManager.slash(validator, "Reveal mismatch");
      throw error;
    }
    if (!truthful) {
      this.stakeManager.slash(validator, "Dishonest vote");
    }
  }

  finalize(round: CommitRevealRound, truth: boolean) {
    const outcome = round.finalizeRound(truth);
    if (outcome === "FALSEHOOD") {
      round.getCommitRecords().forEach((record) => {
        if (record.truthful && record.vote !== truth) {
          this.stakeManager.slash(record.validator, "Voted against truth");
        }
      });
    }
    round.getCommitRecords().forEach((record) => {
      if (!record.revealed) {
        this.stakeManager.slash(record.validator, "Failed to reveal");
      }
    });
    return outcome;
  }

  simulateJobBatch(jobs: JobResult[], submitter: Address) {
    const proof = this.zkVerifier.produceProof(jobs, submitter);
    const verified = this.zkVerifier.verifyProof(proof, jobs, this.config.batch.trustedVerifier);
    if (!verified) {
      throw new Error("Batch verification failed");
    }
    return proof;
  }

  emitExecutionEvent(event: ExecutionEvent) {
    this.sentinel.observe(event);
  }

  listValidators(): ValidatorProfile[] {
    return this.stakeManager.listActive();
  }

  updateRoundConfig(config: Partial<RoundConfiguration>) {
    this.config.round = { ...this.config.round, ...config };
  }

  updateSentinelConfig(config: Partial<SentinelConfig>) {
    const existingAlerts = this.sentinel.getAlerts();
    this.config.sentinel = { ...this.config.sentinel, ...config } as SentinelConfig;
    this.sentinel = new SentinelMonitor(this.config.sentinel, this.pauseManager, existingAlerts);
  }

  updateBatchConfig(config: Partial<BatchConfig>) {
    this.config.batch = { ...this.config.batch, ...config } as BatchConfig;
    this.zkVerifier = new ZkBatchVerifier(this.config.batch);
  }
}
