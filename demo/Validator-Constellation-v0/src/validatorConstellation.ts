import { createHash, randomBytes } from 'crypto';
import { simpleVRF, shuffleAddresses } from './vrf';
import {
  AgentIdentity,
  BatchAttestationRecord,
  CommitRevealWindowConfig,
  DemoScenarioConfig,
  DemoScenarioResult,
  DomainPauseState,
  ENSVerificationReport,
  GovernanceControl,
  IdentityProof,
  JobOutcome,
  JobValidationRound,
  OperatorDashboardState,
  SentinelAlert,
  StakeLedgerEntry,
  SubgraphEvent,
  ValidationTelemetry,
  ValidationVote,
  ValidatorIdentity,
  ValidatorPerformanceSnapshot,
  ValidatorSlashing,
  ZKBatchProof,
} from './types';
import { buildEnsVerificationReport, evaluateNamePolicy, normalizeEns } from './ensPolicy';

const now = (): number => Math.floor(Date.now() / 1000);

const randomHex = (length = 32): string => '0x' + randomBytes(length).toString('hex');

const keccak256 = (...values: string[]): string => {
  const hash = createHash('sha256');
  values.forEach((value) => hash.update(value));
  return '0x' + hash.digest('hex');
};

const commitmentForVote = (jobId: string, vote: ValidationVote, validator: string): string =>
  keccak256(jobId, vote.outcome, vote.salt, validator.toLowerCase());

export class ValidatorConstellation {
  private validators: Map<string, ValidatorIdentity> = new Map();
  private agents: Map<string, AgentIdentity> = new Map();
  private jobs: Map<string, JobValidationRound> = new Map();
  private sentinelAlerts: SentinelAlert[] = [];
  private domainPause: Map<string, DomainPauseState> = new Map();
  private slashes: ValidatorSlashing[] = [];
  private zkBatches: BatchAttestationRecord[] = [];
  private events: SubgraphEvent[] = [];
  private stakes: Map<string, bigint> = new Map();
  private governance: GovernanceControl;
  private performance: Map<string, ValidatorPerformanceSnapshot> = new Map();
  private stakeLedger: StakeLedgerEntry[] = [];
  private telemetry: ValidationTelemetry[] = [];
  private vrfSecretKey: string;
  private vrfPublicKey: string;

  constructor(private readonly config: CommitRevealWindowConfig, owner: string) {
    this.governance = {
      owner,
      pausers: new Set([owner]),
      sentinels: new Set([owner]),
      ensAdmins: new Set([owner]),
    };
    this.vrfSecretKey = randomHex(32);
    this.vrfPublicKey = keccak256(this.vrfSecretKey);
  }

  updateCommitRevealConfig(updates: Partial<CommitRevealWindowConfig>, caller: string): CommitRevealWindowConfig {
    this.assertGovernanceAuthority(caller);
    Object.assign(this.config, updates);
    return { ...this.config };
  }

  rotateVRFSecret(newSecret: string, caller: string): string {
    this.assertGovernanceAuthority(caller);
    this.vrfSecretKey = newSecret;
    this.vrfPublicKey = keccak256(newSecret);
    return this.vrfPublicKey;
  }

  getGovernance(): GovernanceControl {
    return this.governance;
  }

  getTelemetry(): ValidationTelemetry[] {
    return [...this.telemetry];
  }

  getEvents(): SubgraphEvent[] {
    return [...this.events];
  }

  getValidators(): ValidatorIdentity[] {
    return Array.from(this.validators.values());
  }

  getAgents(): AgentIdentity[] {
    return Array.from(this.agents.values());
  }

  getJobs(): JobValidationRound[] {
    return Array.from(this.jobs.values());
  }

  getSentinelAlerts(): SentinelAlert[] {
    return [...this.sentinelAlerts];
  }

  getPausedDomains(): DomainPauseState[] {
    return Array.from(this.domainPause.values()).filter((state) => state.paused);
  }

  getStakeLedger(): StakeLedgerEntry[] {
    return [...this.stakeLedger];
  }

  getBatches(): BatchAttestationRecord[] {
    return [...this.zkBatches];
  }

  getSlashes(): ValidatorSlashing[] {
    return [...this.slashes];
  }

  authorizePauser(address: string): void {
    if (address.toLowerCase() === '0x0') throw new Error('invalid address');
    this.governance.pausers.add(address.toLowerCase());
  }

  authorizeSentinel(address: string): void {
    this.governance.sentinels.add(address.toLowerCase());
  }

  authorizeEnsAdmin(address: string): void {
    this.governance.ensAdmins.add(address.toLowerCase());
  }

  registerValidator(validator: ValidatorIdentity, proof: IdentityProof): ENSVerificationReport {
    this.assertGovernanceAuthority(proof.owner);
    const normalizedAddress = validator.address.toLowerCase();
    const normalizedEns = normalizeEns(validator.ensName);
    const evaluation = evaluateNamePolicy(normalizedEns, 'validator');
    if (!evaluation.valid) {
      throw new Error(`ENS policy violation: ${evaluation.reasons.join('; ')}`);
    }
    if (proof.ensName.toLowerCase() !== normalizedEns) {
      throw new Error('Proof ENS mismatch');
    }
    if (proof.expiresAt < now()) {
      throw new Error('Identity proof expired');
    }
    const record: ValidatorIdentity = {
      ...validator,
      address: normalizedAddress,
      ensName: normalizedEns,
      registeredAt: now(),
      active: true,
    };
    this.validators.set(normalizedAddress, record);
    this.stakes.set(normalizedAddress, validator.stake);
    this.performance.set(normalizedAddress, {
      validator: record,
      totalJobs: 0,
      correctVotes: 0,
      incorrectVotes: 0,
      missedReveals: 0,
    });
    this.pushEvent('ValidatorRegistered', {
      validator: normalizedAddress,
      ensName: normalizedEns,
      stake: validator.stake.toString(),
    });
    return buildEnsVerificationReport(validator.ensName, validator.address, 'validator');
  }

  registerAgent(agent: AgentIdentity, proof: IdentityProof): ENSVerificationReport {
    if (!this.governance.ensAdmins.has(proof.owner.toLowerCase())) {
      throw new Error('Caller is not ENS admin');
    }
    const normalizedAddress = agent.address.toLowerCase();
    const normalizedEns = normalizeEns(agent.ensName);
    const evaluation = evaluateNamePolicy(normalizedEns, 'agent');
    if (!evaluation.valid) {
      throw new Error(`ENS policy violation: ${evaluation.reasons.join('; ')}`);
    }
    if (proof.ensName.toLowerCase() !== normalizedEns) {
      throw new Error('Proof ENS mismatch');
    }
    const record: AgentIdentity = {
      ...agent,
      address: normalizedAddress,
      ensName: normalizedEns,
    };
    this.agents.set(normalizedAddress, record);
    return buildEnsVerificationReport(agent.ensName, proof.owner, 'agent');
  }

  private assertGovernanceAuthority(address: string): void {
    if (address.toLowerCase() !== this.governance.owner.toLowerCase()) {
      throw new Error('Only owner may perform this action');
    }
  }

  private isDomainPaused(domain: string): boolean {
    return this.domainPause.get(domain)?.paused ?? false;
  }

  requestValidation(jobId: string, domain: string, batchRoot: string): JobValidationRound {
    if (this.jobs.has(jobId)) {
      throw new Error('Job already exists');
    }
    if (this.isDomainPaused(domain)) {
      throw new Error(`Domain ${domain} is paused`);
    }
    const validators = this.getActiveValidatorsForDomain(domain);
    if (validators.length < this.config.validatorsPerJob) {
      throw new Error('Insufficient validators');
    }
    const vrfProof = simpleVRF.generateProof(jobId + this.config.vrfSeed, this.vrfSecretKey);
    const randomness = simpleVRF.deriveRandomness(vrfProof);
    const shuffled = shuffleAddresses(validators.map((val) => val.address), randomness);
    const committee = shuffled.slice(0, this.config.validatorsPerJob);
    const round: JobValidationRound = {
      jobId,
      domain,
      batchRoot,
      requestedAt: now(),
      commitments: new Map(),
      reveals: new Map(),
      finalized: false,
      vrfRandomness: randomness,
      committee,
    };
    this.jobs.set(jobId, round);
    this.telemetry.push({
      jobId,
      domain,
      committee,
      commitDeadline: round.requestedAt + this.config.commitWindowSeconds,
      revealDeadline: round.requestedAt + this.config.commitWindowSeconds + this.config.revealWindowSeconds,
      vrfRandomness: randomness,
    });
    this.pushEvent('JobFinalized', {
      jobId,
      state: 'requested',
      committee,
    });
    return round;
  }

  private getActiveValidatorsForDomain(domain: string): ValidatorIdentity[] {
    return this.getValidators().filter((validator) => validator.active && validator.domain === domain);
  }

  commitVote(jobId: string, validatorAddress: string, commitment: string): void {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error('Job not found');
    if (job.finalized) throw new Error('Job already finalized');
    if (!job.committee.includes(validatorAddress.toLowerCase())) {
      throw new Error('Validator not in committee');
    }
    const deadline = job.requestedAt + this.config.commitWindowSeconds;
    if (now() > deadline) throw new Error('Commit window closed');
    job.commitments.set(validatorAddress.toLowerCase(), commitment);
  }

  revealVote(jobId: string, validatorAddress: string, vote: ValidationVote): JobOutcome | undefined {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error('Job not found');
    if (!job.committee.includes(validatorAddress.toLowerCase())) {
      throw new Error('Validator not in committee');
    }
    const commit = job.commitments.get(validatorAddress.toLowerCase());
    if (!commit) throw new Error('Commitment missing');
    const expectedCommit = commitmentForVote(jobId, vote, validatorAddress);
    if (commit !== expectedCommit) {
      this.applyPenalty(validatorAddress.toLowerCase(), jobId, 'Invalid reveal', this.config.incorrectVotePenaltyBps);
      throw new Error('Invalid reveal');
    }
    const deadline = job.requestedAt + this.config.commitWindowSeconds + this.config.revealWindowSeconds;
    if (now() > deadline) {
      this.applyPenalty(validatorAddress.toLowerCase(), jobId, 'Reveal missed', this.config.nonRevealPenaltyBps);
      this.incrementMissedReveal(validatorAddress.toLowerCase());
      throw new Error('Reveal window closed');
    }
    job.reveals.set(validatorAddress.toLowerCase(), vote);
    this.updatePerformance(validatorAddress.toLowerCase(), vote.outcome === 'approved');
    if (job.reveals.size >= this.config.revealQuorum) {
      this.finalizeJob(jobId);
    }
    return vote.outcome;
  }

  private finalizeJob(jobId: string): void {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error('Job not found');
    if (job.finalized) return;
    const approvals = Array.from(job.reveals.values()).filter((vote) => vote.outcome === 'approved').length;
    const rejections = job.reveals.size - approvals;
    const outcome: JobOutcome = approvals >= rejections ? 'approved' : 'rejected';
    job.finalized = true;
    job.finalizedAt = now();
    this.pushEvent('JobFinalized', {
      jobId,
      outcome,
      approvals,
      rejections,
      committee: job.committee,
    });
  }

  enforceRevealPenalties(): void {
    for (const job of this.jobs.values()) {
      if (job.finalized) continue;
      const revealDeadline = job.requestedAt + this.config.commitWindowSeconds + this.config.revealWindowSeconds;
      if (now() <= revealDeadline) continue;
      job.committee.forEach((validator) => {
        if (!job.reveals.has(validator)) {
          this.applyPenalty(validator, job.jobId, 'Reveal not submitted', this.config.nonRevealPenaltyBps);
          this.incrementMissedReveal(validator);
        }
      });
      this.finalizeJob(job.jobId);
    }
  }

  private incrementMissedReveal(validator: string): void {
    const snapshot = this.performance.get(validator);
    if (snapshot) {
      snapshot.totalJobs += 1;
      snapshot.missedReveals += 1;
    }
  }

  private updatePerformance(validator: string, correct: boolean): void {
    const snapshot = this.performance.get(validator);
    if (!snapshot) return;
    snapshot.totalJobs += 1;
    if (correct) snapshot.correctVotes += 1;
    else snapshot.incorrectVotes += 1;
  }

  private applyPenalty(validator: string, jobId: string, reason: string, penaltyBps: number): void {
    const stake = this.stakes.get(validator) ?? 0n;
    const penalty = (stake * BigInt(penaltyBps)) / 10000n;
    const newStake = stake - penalty;
    this.stakes.set(validator, newStake);
    const record = this.validators.get(validator);
    if (record) {
      this.slashes.push({
        validator: record,
        penalty,
        reason,
        jobId,
        occurredAt: now(),
      });
      this.pushEvent('ValidatorSlashed', {
        validator,
        ensName: record.ensName,
        penalty: penalty.toString(),
        reason,
        jobId,
      });
    }
    this.stakeLedger.push({
      validator,
      previousStake: stake,
      newStake,
      reason,
      timestamp: now(),
    });
  }

  raiseSentinelAlert(alert: Omit<SentinelAlert, 'id' | 'triggeredAt'>, caller: string): SentinelAlert {
    if (!this.governance.sentinels.has(caller.toLowerCase())) {
      throw new Error('Unauthorized sentinel');
    }
    const fullAlert: SentinelAlert = {
      ...alert,
      id: randomHex(16),
      triggeredAt: now(),
    };
    this.sentinelAlerts.push(fullAlert);
    this.pushEvent('SentinelAlert', fullAlert);
    if (alert.severity === 'critical') {
      this.pauseDomain(alert.domain, `Critical sentinel alert: ${alert.reason}`, caller);
    }
    return fullAlert;
  }

  pauseDomain(domain: string, reason: string, caller: string): DomainPauseState {
    if (!this.governance.pausers.has(caller.toLowerCase())) {
      throw new Error('Unauthorized pauser');
    }
    const state: DomainPauseState = {
      domain,
      paused: true,
      pausedAt: now(),
      reason,
      initiatedBy: caller.toLowerCase(),
    };
    this.domainPause.set(domain, state);
    this.pushEvent('DomainPaused', state);
    return state;
  }

  resumeDomain(domain: string, caller: string): DomainPauseState {
    if (!this.governance.pausers.has(caller.toLowerCase())) {
      throw new Error('Unauthorized pauser');
    }
    const state = this.domainPause.get(domain);
    if (!state) {
      throw new Error('Domain not paused');
    }
    const resumed: DomainPauseState = {
      ...state,
      paused: false,
      reason: undefined,
      pausedAt: undefined,
    };
    this.domainPause.set(domain, resumed);
    this.pushEvent('DomainResumed', { domain });
    return resumed;
  }

  submitZKBatchProof(jobIds: string[], submittedBy: string): BatchAttestationRecord {
    if (jobIds.length === 0) {
      throw new Error('Empty batch');
    }
    const jobs = jobIds.map((id) => this.jobs.get(id));
    if (jobs.some((job) => !job || !job.finalized)) {
      throw new Error('All jobs must be finalized');
    }
    const outcome = jobs.every((job) => job?.reveals.size && Array.from(job?.reveals.values()).every((vote) => vote.outcome === 'approved'))
      ? 'approved'
      : 'rejected';
    const jobRoot = keccak256(...jobIds);
    const proof: ZKBatchProof = {
      jobRoot,
      proof: keccak256(jobRoot, submittedBy, randomHex(8)),
      publicInputs: jobIds,
      submittedBy,
      submittedAt: now(),
    };
    const record: BatchAttestationRecord = {
      jobIds,
      aggregatedOutcome: outcome,
      proof,
      accepted: true,
    };
    this.zkBatches.push(record);
    this.pushEvent('ZKProofSubmitted', {
      jobRoot,
      jobIds,
      submittedBy,
    });
    return record;
  }

  buildDashboard(): OperatorDashboardState {
    return {
      validators: this.getValidators(),
      activeJobs: this.getJobs(),
      pausedDomains: this.getPausedDomains(),
      sentinelAlerts: this.getSentinelAlerts(),
      zkBatches: this.getBatches(),
      slashes: this.getSlashes(),
      events: [...this.events.map((event) => ({
        level: 'INFO' as const,
        message: event.type,
        context: event.data,
        timestamp: event.emittedAt,
      }))],
    };
  }

  private pushEvent(type: SubgraphEvent['type'], data: Record<string, unknown> | unknown): void {
    const payload: Record<string, unknown> =
      typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : { value: data };
    this.events.push({
      type,
      data: payload,
      blockNumber: this.events.length + 1,
      txHash: randomHex(20),
      emittedAt: now(),
    });
  }

  runDemoScenario(config: DemoScenarioConfig): DemoScenarioResult {
    const owner = this.governance.owner;
    config.validators.forEach((validator) => {
      this.registerValidator(
        {
          ...validator,
          registeredAt: now(),
          active: true,
        },
        {
          ensName: validator.ensName,
          owner,
          signature: randomHex(16),
          issuedAt: now(),
          expiresAt: now() + 86400,
        },
      );
    });
    config.agents.forEach((agent) => {
      this.registerAgent(
        agent,
        {
          ensName: agent.ensName,
          owner,
          signature: randomHex(16),
          issuedAt: now(),
          expiresAt: now() + 86400,
        },
      );
    });

    const results: string[] = [];
    config.jobs.forEach((job) => {
      const round = this.requestValidation(job.jobId, job.domain, keccak256(job.jobId));
      for (const validator of round.committee) {
        const current = this.jobs.get(job.jobId);
        if (current?.finalized) break;
        const vote: ValidationVote = {
          outcome: job.outcome,
          salt: randomHex(8),
        };
        const commitment = commitmentForVote(job.jobId, vote, validator);
        this.commitVote(job.jobId, validator, commitment);
        this.revealVote(job.jobId, validator, vote);
      }
      results.push(job.jobId);
    });

    config.anomalies.forEach((anomaly) => {
      if ('attemptedSpend' in anomaly) {
        this.raiseSentinelAlert(
          {
            domain: anomaly.agent.domain,
            reason: `Budget overrun detected for ${anomaly.agent.ensName}`,
            severity: 'critical',
          },
          owner,
        );
      } else {
        this.raiseSentinelAlert(
          {
            domain: anomaly.agent.domain,
            reason: `Unsafe call ${anomaly.callSignature}`,
            severity: 'warning',
          },
          owner,
        );
      }
    });

    const batch = this.submitZKBatchProof(results, owner);

    return {
      batchProofs: [batch],
      slashes: this.getSlashes(),
      pausedDomains: this.getPausedDomains(),
      sentinelAlerts: this.getSentinelAlerts(),
      finalJobs: this.getJobs(),
      dashboard: this.buildDashboard(),
    };
  }
}

export const commitmentFor = commitmentForVote;
