import { JsonRpcProvider, Wallet } from 'ethers';
import { loadAlphaNodeConfig, makeEnsName, NormalisedAlphaNodeConfig } from './config';
import { RpcEnsLookup } from './identity/rpcLookup';
import { verifyNodeIdentity } from './identity/verify';
import type { IdentityVerificationResult } from './identity/types';
import { fetchStakeSnapshot, ensureStake, StakeActionReport, StakeSnapshot } from './blockchain/staking';
import { fetchRewardSnapshot, RewardSnapshot } from './blockchain/rewards';
import { AlphaPlanner, JobOpportunity, PlanningSummary } from './ai/planner';
import { SpecialistOrchestrator, SpecialistInsight } from './ai/orchestrator';
import { AntifragileShell, StressTestResult } from './ai/antifragile';
import { AlphaNodeMetrics } from './monitoring/metrics';
import { AlphaNodeLogger } from './utils/logger';

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

  constructor(private readonly context: AlphaNodeContext) {
    this.planner = new AlphaPlanner(context.config);
    this.orchestrator = new SpecialistOrchestrator(context.config);
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

  async verifyIdentity(): Promise<IdentityVerificationResult> {
    const lookup = new RpcEnsLookup(this.context.provider, this.context.config.contracts.ens);
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
