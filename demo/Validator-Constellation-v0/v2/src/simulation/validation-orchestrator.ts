import { DomainController } from '../domain/domain-controller.js';
import { EnsRegistry } from '../identity/ens-registry.js';
import { JobLedger, JobSpec } from '../jobs/job-ledger.js';
import { Sentinel } from '../sentinel/sentinel.js';
import { Domain, JobOutcome, ValidatorProfile } from '../types.js';
import { CommitRevealRound, CommitRevealConfig } from '../validators/commit-reveal.js';
import { ValidatorRegistry, ValidatorRegistryConfig } from '../validators/validator-registry.js';
import { VrfCommitteeSelector, CommitteeSelectionConfig } from '../validators/vrf-committee.js';
import { ZkBatchAttestor, ZkBatchConfig } from '../zk/zk-batcher.js';

export interface ValidationOrchestratorConfig {
  validatorRegistry: ValidatorRegistryConfig;
  commitReveal: CommitRevealConfig;
  committee: CommitteeSelectionConfig;
  zkBatch: ZkBatchConfig;
}

export interface SlashEvent {
  address: `0x${string}`;
  ensName: string;
  reason: string;
  newStake: bigint;
}

export class ValidationOrchestrator {
  private ledger = new JobLedger();
  private validatorRegistry: ValidatorRegistry;
  private committeeSelector: VrfCommitteeSelector;
  private zkBatcher: ZkBatchAttestor;
  private slashEvents: SlashEvent[] = [];
  private blockNumber = 0;

  constructor(
    private ensRegistry: EnsRegistry,
    private sentinel: Sentinel,
    private domainController: DomainController,
    private config: ValidationOrchestratorConfig
  ) {
    this.validatorRegistry = new ValidatorRegistry(ensRegistry, config.validatorRegistry);
    this.committeeSelector = new VrfCommitteeSelector(config.committee);
    this.zkBatcher = new ZkBatchAttestor(config.zkBatch);
    this.sentinel.on('alert', (alert) => {
      this.domainController.pause(alert.domain, alert.reason);
    });
  }

  public registerValidator(address: `0x${string}`, ensName: string, stake: bigint) {
    this.validatorRegistry.register(address, ensName, stake);
  }

  public submitJobs(jobs: JobSpec[]) {
    for (const job of jobs) {
      this.ledger.registerJob(job);
    }
  }

  public executeJob(jobId: string, agent: { profile: { ensName: string; domain: Domain; budgetLimit: bigint; address: `0x${string}` } }, success: boolean, cost: bigint, actionSignature: string) {
    if (this.domainController.isPaused(agent.profile.domain)) {
      throw new Error(`Domain ${agent.profile.domain} paused`);
    }
    const outcome = this.ledger.executeJob(jobId, agent.profile, success, cost);
    this.sentinel.monitor(outcome, agent.profile, actionSignature);
    return outcome;
  }

  public runValidationRound(roundId: string, jobIds: string[]) {
    this.blockNumber += 1;
    const activeValidators = this.validatorRegistry.findActive();
    const committee = this.committeeSelector.selectCommittee(activeValidators, roundId);
    const round = new CommitRevealRound(this.config.commitReveal, this.blockNumber, roundId);
    const saltBase = `${roundId}|${this.blockNumber}`;
    const commits: { validator: ValidatorProfile; salt: string; payload: { roundId: string; jobId: string; vote: boolean } }[] = [];

    for (const validator of committee) {
      const payload = { roundId, jobId: jobIds.join(','), vote: true };
      const salt = `${saltBase}|${validator.address}`;
      round.commit(validator.address, payload, salt);
      commits.push({ validator, salt, payload });
    }

    this.blockNumber += 1;
    for (const { validator, salt, payload } of commits) {
      round.reveal(validator.address, { ...payload, salt }, salt, this.blockNumber);
      this.validatorRegistry.reward(validator.address, 1_000_000_000_000_000_000n);
    }
    round.closeRound();
    const result = round.computeResult();
    if (!result.quorumReached || result.noVotes > 0) {
      for (const offender of result.slashCandidates) {
        const profile = this.validatorRegistry.get(offender);
        if (profile) {
          const slash = this.validatorRegistry.slash(offender, this.config.commitReveal.slashPenaltyReason);
          this.slashEvents.push({
            address: offender,
            ensName: profile.ensName,
            reason: this.config.commitReveal.slashPenaltyReason,
            newStake: slash.newStake,
          });
        }
      }
    }
    const outcomes: JobOutcome[] = jobIds
      .map((jobId) => this.ledger.getOutcome(jobId))
      .filter((outcome): outcome is JobOutcome => !!outcome);
    const proof = this.zkBatcher.buildProof(outcomes);
    return { proof, committee, slashEvents: [...this.slashEvents] };
  }

  public getSlashEvents() {
    return [...this.slashEvents];
  }

  public listOutcomes() {
    return this.ledger.listOutcomes();
  }
}
