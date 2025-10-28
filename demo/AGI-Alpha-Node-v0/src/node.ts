import { JsonRpcProvider, Wallet } from 'ethers';
import { loadAlphaNodeConfig, makeEnsName, NormalisedAlphaNodeConfig } from './config';
import { RpcEnsLookup } from './identity/rpcLookup';
import { verifyNodeIdentity } from './identity/verify';
import type { IdentityVerificationResult } from './identity/types';
import { fetchStakeSnapshot, ensureStake, StakeActionReport, StakeSnapshot } from './blockchain/staking';
import { fetchRewardSnapshot, RewardSnapshot } from './blockchain/rewards';
import {
  createJobLifecycle,
  DiscoveredJob,
  JobActionOptions,
  JobActionReceipt,
  JobCycleReport,
  JobDiscoveryOptions
} from './blockchain/jobs';
import { AlphaPlanner, JobOpportunity, PlanningSummary } from './ai/planner';
import { SpecialistOrchestrator, SpecialistInsight } from './ai/orchestrator';
import { AntifragileShell, StressTestResult } from './ai/antifragile';
import { AlphaNodeMetrics } from './monitoring/metrics';
import { AlphaNodeLogger } from './utils/logger';
import { defaultOpportunities } from './utils/opportunities';

export interface AlphaNodeContext {
  readonly config: NormalisedAlphaNodeConfig;
  readonly provider: JsonRpcProvider;
  readonly signer: Wallet;
  readonly metrics: AlphaNodeMetrics;
  readonly logger: AlphaNodeLogger;
}

export class AlphaNode {
  private readonly planner: AlphaPlanner;
  private readonly orchestrator: SpecialistOrchestrator;
  private readonly antifragileShell = new AntifragileShell();
  private readonly jobLifecycle: ReturnType<typeof createJobLifecycle>;
  private readonly operatorAddress: string;

  constructor(private readonly context: AlphaNodeContext) {
    this.planner = new AlphaPlanner(context.config);
    this.orchestrator = new SpecialistOrchestrator(context.config);
    this.jobLifecycle = createJobLifecycle({ signer: context.signer, config: context.config });
    this.operatorAddress = context.signer.address;
  }

  static async fromConfig(configPath: string, privateKey: string): Promise<AlphaNode> {
    const config = await loadAlphaNodeConfig(configPath);
    const provider = new JsonRpcProvider(config.network.rpcUrl, config.network.chainId);
    const normalizedKey = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;
    const signer = new Wallet(normalizedKey, provider);
    const metrics = new AlphaNodeMetrics();
    const logger = new AlphaNodeLogger(config.monitoring.logFile);
    return new AlphaNode({ config, provider, signer, metrics, logger });
  }

  getConfig(): NormalisedAlphaNodeConfig {
    return this.context.config;
  }

  getMetrics(): AlphaNodeMetrics {
    return this.context.metrics;
  }

  getLogger(): AlphaNodeLogger {
    return this.context.logger;
  }

  getSigner(): Wallet {
    return this.context.signer;
  }

  async verifyIdentity(): Promise<IdentityVerificationResult> {
    const lookup = new RpcEnsLookup(this.context.provider, {
      registry: this.context.config.contracts.ens.registry,
      nameWrapper: this.context.config.contracts.ens.nameWrapper,
      publicResolver: this.context.config.contracts.ens.publicResolver
    });
    const result = await verifyNodeIdentity(this.context.config, lookup);
    this.context.metrics.updateIdentity(result);
    this.context.logger.info('identity_verified', {
      ensName: makeEnsName(this.context.config),
      matches: result.matches,
      reasons: result.reasons
    });
    return result;
  }

  async stake(options?: { dryRun?: boolean; acknowledgeTax?: boolean }): Promise<StakeActionReport> {
    const report = await ensureStake(this.context.signer, this.context.config, options);
    const snapshot = await fetchStakeSnapshot(this.context.signer, this.context.config);
    this.context.metrics.updateStake(snapshot);
    this.context.logger.info('stake_result', {
      amountStaked: report.amountStaked.toString(),
      activated: report.activated,
      notes: report.notes
    });
    return report;
  }

  async collectRewards(): Promise<RewardSnapshot> {
    const snapshot = await fetchRewardSnapshot(this.context.signer, this.context.config);
    this.context.metrics.updateRewards(snapshot);
    this.context.logger.info('reward_snapshot', {
      pending: snapshot.pending.toString(),
      projectedDaily: snapshot.projectedDaily
    });
    return snapshot;
  }

  async discoverJobs(options?: JobDiscoveryOptions): Promise<DiscoveredJob[]> {
    const jobs = await this.jobLifecycle.discover(options);
    this.context.metrics.updateJobDiscovery(jobs.filter((job) => job.isOpen).length);
    this.context.logger.info('job_discovery', {
      count: jobs.length,
      open: jobs.filter((job) => job.isOpen).length,
      fromBlock: options?.fromBlock,
      toBlock: options?.toBlock
    });
    return jobs;
  }

  toOpportunities(jobs: readonly DiscoveredJob[]): JobOpportunity[] {
    return this.jobLifecycle.toOpportunities(jobs);
  }

  async applyForJob(jobId: bigint, options?: JobActionOptions): Promise<JobActionReceipt> {
    const receipt = await this.jobLifecycle.apply(jobId, options);
    this.context.logger.info('job_apply', { jobId: jobId.toString(), receipt });
    return receipt;
  }

  async submitJob(jobId: bigint, options?: JobActionOptions): Promise<JobActionReceipt> {
    const receipt = await this.jobLifecycle.submit(jobId, options);
    this.context.logger.info('job_submit', { jobId: jobId.toString(), receipt });
    return receipt;
  }

  async finalizeJob(jobId: bigint, options?: JobActionOptions): Promise<JobActionReceipt> {
    const receipt = await this.jobLifecycle.finalize(jobId, options);
    this.context.logger.info('job_finalize', { jobId: jobId.toString(), receipt });
    return receipt;
  }

  async runJobCycle(jobId: bigint, options?: JobActionOptions): Promise<JobCycleReport> {
    const report = await this.jobLifecycle.run(jobId, options);
    this.context.logger.info('job_cycle', { jobId: jobId.toString(), report });
    return report;
  }

  async autopilot(options?: JobActionOptions & JobDiscoveryOptions): Promise<AlphaNodeAutopilot> {
    const discovered = await this.discoverJobs(options);
    const opportunities = discovered.length > 0 ? this.toOpportunities(discovered) : defaultOpportunities();
    const plan = this.plan(opportunities);
    let execution: JobCycleReport | undefined;
    if (plan.summary.selectedJobId) {
      const executionOptions: JobActionOptions = {
        dryRun: options?.dryRun ?? true,
        proof: options?.proof,
        resultUri: options?.resultUri,
        resultHash: options?.resultHash,
        hashAlgorithm: options?.hashAlgorithm
      };
      execution = await this.runJobCycle(BigInt(plan.summary.selectedJobId), executionOptions);
      const selectedJob = opportunities.find((job) => job.jobId === plan.summary.selectedJobId);
      this.context.metrics.updateJobExecution(selectedJob?.reward);
    } else {
      this.context.metrics.updateJobExecution(undefined);
    }
    return {
      operator: this.operatorAddress,
      discovered,
      opportunities,
      plan,
      execution
    };
  }

  plan(opportunities: JobOpportunity[]): {
    summary: PlanningSummary;
    insights: SpecialistInsight[];
  } {
    const summary = this.planner.plan(opportunities);
    const tags = opportunities.find((job) => job.jobId === summary.selectedJobId)?.tags ?? [];
    const insights = this.orchestrator.dispatch(tags);
    this.context.metrics.updatePlanning(summary);
    this.context.logger.info('planning_cycle', {
      alphaScore: summary.alphaScore,
      selectedJobId: summary.selectedJobId,
      insights
    });
    return { summary, insights };
  }

  stressTest(): StressTestResult[] {
    const results = this.antifragileShell.run();
    const passed = results.every((result) => result.passed);
    this.antifragileShell.escalate(passed);
    this.context.logger.info('stress_test', { passed, results });
    return results;
  }

  async heartbeat(opportunities: JobOpportunity[]): Promise<AlphaNodeHeartbeat> {
    const [identity, stakeSnapshot, rewards] = await Promise.all([
      this.verifyIdentity(),
      fetchStakeSnapshot(this.context.signer, this.context.config),
      this.collectRewards()
    ]);

    const plan = this.plan(opportunities);
    const stress = this.stressTest();

    return {
      identity,
      stakeSnapshot,
      rewards,
      plan,
      stress
    };
  }
}

export interface AlphaNodeHeartbeat {
  readonly identity: IdentityVerificationResult;
  readonly stakeSnapshot: StakeSnapshot;
  readonly rewards: RewardSnapshot;
  readonly plan: {
    summary: PlanningSummary;
    insights: SpecialistInsight[];
  };
  readonly stress: StressTestResult[];
}

export interface AlphaNodeAutopilot {
  readonly operator: string;
  readonly discovered: readonly DiscoveredJob[];
  readonly opportunities: readonly JobOpportunity[];
  readonly plan: {
    summary: PlanningSummary;
    insights: SpecialistInsight[];
  };
  readonly execution?: JobCycleReport;
}
