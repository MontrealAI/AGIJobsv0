import { promises as fs } from 'fs';
import { dirname, join } from 'path';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import {
  cloneFabricConfig,
  cloneOwnerCommandSchedule,
  loadFabricConfig,
  loadJobBlueprint,
  loadMissionPlan,
  loadOwnerCommandSchedule,
} from './config-loader';
import { runSimulation, SimulationResult } from './simulation';
import {
  FabricConfig,
  FabricMetrics,
  FabricSummary,
  OwnerCommandSchedule,
  RunMetadata,
  SimulationOptions,
  ShardConfig,
  SpilloverPolicy,
  JobBlueprint,
} from './types';
import { cloneJobBlueprint, countJobsInBlueprint } from './job-blueprint';

const DEFAULT_HIGH_LOAD_JOBS = 10_000;
const DEFAULT_RESTART_STOP_TICKS = 200;
const OUTAGE_TICK_MIN = 5;
const OUTAGE_TICK_MAX = 80;

export interface AcceptanceThresholds {
  maxDropRate: number;
  maxFailureRate: number;
  maxShardBalanceDelta: number;
  maxShardSkewRatio: number;
}

const DEFAULT_THRESHOLDS: AcceptanceThresholds = {
  maxDropRate: 0.02,
  maxFailureRate: 0.01,
  maxShardBalanceDelta: 0.5,
  maxShardSkewRatio: 80,
};

export interface ScenarioAssertion {
  id: string;
  description: string;
  passed: boolean;
  value: unknown;
  threshold?: unknown;
}

export interface HighLoadReport {
  label: string;
  summaryPath: string;
  metrics: FabricMetrics;
  dropRate: number;
  failureRate: number;
  balanceDelta: number;
  shardSkewRatio: number;
  minShardLoad: number;
  assertions: ScenarioAssertion[];
  pass: boolean;
}

export interface RestartScenarioReport {
  label: string;
  checkpointPath: string;
  stageOneSummaryPath: string;
  stageTwoSummaryPath: string;
  stageOneRun: RunMetadata;
  stageTwoRun: RunMetadata;
  stageTwoMetrics: FabricMetrics;
  stageTwoDropRate: number;
  stageTwoFailureRate: number;
  outstandingJobsStageOne: number;
  assertions: ScenarioAssertion[];
  pass: boolean;
}

export interface AcceptanceReport {
  thresholds: AcceptanceThresholds;
  highLoad: HighLoadReport;
  restart: RestartScenarioReport;
  overallPass: boolean;
  missionPlan?: SimulationOptions['missionPlan'];
}

interface ScenarioExecution {
  label: string;
  result: SimulationResult;
  summary: FabricSummary;
}

interface ScenarioConfig {
  config: FabricConfig;
  ownerCommands?: OwnerCommandSchedule[];
  label: string;
  checkpointPath: string;
  jobs: number;
  options: Pick<
    SimulationOptions,
    | 'simulateOutage'
    | 'outageTick'
    | 'stopAfterTicks'
    | 'resume'
    | 'checkpointPath'
    | 'ownerCommands'
    | 'preserveReportDirOnResume'
    | 'jobBlueprint'
    | 'jobBlueprintSource'
    | 'missionPlan'
  >;
}

function sanitiseLabel(label: string): string {
  return label.replace(/[^a-zA-Z0-9-_]/g, '-');
}

function buildCheckpointPath(basePath: string, label: string): string {
  const directory = dirname(basePath);
  const sanitised = sanitiseLabel(label);
  if (basePath.endsWith('.json')) {
    return join(directory, `${sanitised}.json`);
  }
  return join(directory, sanitised);
}

function computeDropRate(metrics: FabricMetrics): number {
  if (metrics.jobsSubmitted === 0) {
    return 0;
  }
  const dropped = metrics.jobsSubmitted - metrics.jobsCompleted;
  return dropped / metrics.jobsSubmitted;
}

function computeFailureRate(metrics: FabricMetrics): number {
  if (metrics.jobsSubmitted === 0) {
    return 0;
  }
  return metrics.jobsFailed / metrics.jobsSubmitted;
}

function computeShardBalance(summary: FabricSummary): {
  balanceDelta: number;
  skewRatio: number;
  minLoad: number;
} {
  const totals = Object.values(summary.shardStatistics).map(
    (entry) => entry.completed + entry.failed + entry.spillovers
  );
  if (totals.length === 0) {
    return { balanceDelta: 0, skewRatio: 1, minLoad: 0 };
  }
  const max = Math.max(...totals);
  const min = Math.min(...totals);
  const total = totals.reduce((sum, value) => sum + value, 0);
  const balanceDelta = total === 0 ? 0 : (max - min) / total;
  if (total === 0) {
    return { balanceDelta: 0, skewRatio: 1, minLoad: min };
  }
  const denominator = min === 0 ? 1 : min;
  const skewRatio = max === 0 ? 1 : max / denominator;
  return { balanceDelta, skewRatio, minLoad: min };
}

function ensureSpilloverPolicies(shard: ShardConfig): SpilloverPolicy[] {
  const policies = shard.router?.spilloverPolicies;
  if (policies && policies.length > 0) {
    return policies.map((policy) => ({ ...policy }));
  }
  return shard.spilloverTargets.map((target, index) => ({
    target,
    threshold: Math.max(10, Math.floor(shard.maxQueue * 0.6)) + index * 15,
    maxDrainPerTick: Math.max(10, Math.floor(shard.maxQueue * 0.15)),
  }));
}

function tuneConfigForAcceptance(base: FabricConfig, checkpointPath: string): FabricConfig {
  const tuned = cloneFabricConfig(base);
  tuned.checkpoint.path = checkpointPath;
  tuned.shards = tuned.shards.map((shard) => {
    const tunedMaxQueue = Math.max(40, Math.floor(shard.maxQueue * 0.6));
    const queueAlert = Math.max(20, Math.floor(tunedMaxQueue * 0.55));
    const basePolicies = ensureSpilloverPolicies({ ...shard, maxQueue: tunedMaxQueue });
    const tunedPolicies = basePolicies.map((policy, index) => ({
      ...policy,
      threshold: Math.min(policy.threshold ?? queueAlert, queueAlert + index * Math.max(4, Math.floor(tunedMaxQueue * 0.07))),
      maxDrainPerTick: Math.max(policy.maxDrainPerTick ?? 1, Math.max(4, Math.floor(tunedMaxQueue * 0.12))),
    }));
    return {
      ...shard,
      maxQueue: tunedMaxQueue,
      router: {
        queueAlertThreshold: queueAlert,
        spilloverPolicies: tunedPolicies,
      },
    };
  });
  tuned.nodes = tuned.nodes.map((node) => ({
    ...node,
    capacity: Math.max(2, Math.floor(node.capacity * 0.6)),
    maxConcurrency: Math.max(1, Math.floor(node.maxConcurrency * 0.55)),
  }));
  const shardsWithGeneral = new Set<string>();
  for (const node of tuned.nodes) {
    if (node.specialties.includes('general')) {
      shardsWithGeneral.add(node.region);
    }
  }
  for (const shard of tuned.shards) {
    if (shardsWithGeneral.has(shard.id)) {
      continue;
    }
    tuned.nodes.push({
      id: `${shard.id}.safety-general`,
      region: shard.id,
      capacity: 2,
      specialties: ['general'],
      heartbeatIntervalSec: 12,
      maxConcurrency: 1,
    });
  }
  return tuned;
}

async function readSummary(path: string): Promise<FabricSummary> {
  const raw = await fs.readFile(path, 'utf8');
  return JSON.parse(raw) as FabricSummary;
}

async function executeScenario(config: ScenarioConfig): Promise<ScenarioExecution> {
  const configClone = cloneFabricConfig(config.config);
  configClone.checkpoint.path = config.checkpointPath;
  const ownerCommandsClone = cloneOwnerCommandSchedule(config.ownerCommands);
  const options: SimulationOptions = {
    jobs: config.jobs,
    simulateOutage: config.options.simulateOutage,
    outageTick: config.options.outageTick,
    stopAfterTicks: config.options.stopAfterTicks,
    resume: config.options.resume,
    checkpointPath: config.checkpointPath,
    outputLabel: config.label,
    ownerCommands: ownerCommandsClone,
    ownerCommandSource:
      config.options.missionPlan?.ownerCommandsSource ?? 'acceptance-suite',
    preserveReportDirOnResume: config.options.preserveReportDirOnResume,
    ciMode: true,
    jobBlueprint: cloneJobBlueprint(config.options.jobBlueprint),
    jobBlueprintSource: config.options.jobBlueprintSource,
    missionPlan: config.options.missionPlan,
  };
  const result = await runSimulation(configClone, options);
  const summary = await readSummary(result.artifacts.summaryPath);
  return { label: config.label, result, summary };
}

function evaluateHighLoad(
  execution: ScenarioExecution,
  thresholds: AcceptanceThresholds
): HighLoadReport {
  const metrics = execution.summary.metrics;
  const dropRate = computeDropRate(metrics);
  const failureRate = computeFailureRate(metrics);
  const { balanceDelta, skewRatio, minLoad } = computeShardBalance(execution.summary);
  const skewStep = minLoad > 0 ? 1 / minLoad : 0;
  const skewTolerance = Math.max(1e-6, skewStep);
  const assertions: ScenarioAssertion[] = [
    {
      id: 'drop-rate',
      description: `Drop rate <= ${(thresholds.maxDropRate * 100).toFixed(2)}%`,
      passed: dropRate <= thresholds.maxDropRate,
      value: dropRate,
      threshold: thresholds.maxDropRate,
    },
    {
      id: 'failure-rate',
      description: `Failure rate <= ${(thresholds.maxFailureRate * 100).toFixed(2)}%`,
      passed: failureRate <= thresholds.maxFailureRate,
      value: failureRate,
      threshold: thresholds.maxFailureRate,
    },
    {
      id: 'spillover-activity',
      description: 'Spillover activity observed across shards',
      passed: metrics.spillovers > 0,
      value: metrics.spillovers,
    },
    {
      id: 'failover-reassignment',
      description: 'Tasks were reassigned after node failure',
      passed: metrics.reassignedAfterFailure > 0,
      value: metrics.reassignedAfterFailure,
    },
    {
      id: 'balance-delta',
      description: `Shard balance delta <= ${(thresholds.maxShardBalanceDelta * 100).toFixed(1)}% of throughput`,
      passed: balanceDelta <= thresholds.maxShardBalanceDelta,
      value: balanceDelta,
      threshold: thresholds.maxShardBalanceDelta,
    },
    {
      id: 'shard-skew',
      description: `Shard skew ratio <= ${thresholds.maxShardSkewRatio.toFixed(2)}x`,
      passed: skewRatio <= thresholds.maxShardSkewRatio + skewTolerance,
      value: skewRatio,
      threshold: thresholds.maxShardSkewRatio,
    },
  ];

  return {
    label: execution.label,
    summaryPath: execution.result.artifacts.summaryPath,
    metrics,
    dropRate,
    failureRate,
    balanceDelta,
    shardSkewRatio: skewRatio,
    minShardLoad: minLoad,
    assertions,
    pass: assertions.every((assertion) => assertion.passed),
  };
}

function evaluateRestart(
  stageOne: ScenarioExecution,
  stageTwo: ScenarioExecution,
  thresholds: AcceptanceThresholds,
  checkpointPath: string
): RestartScenarioReport {
  const stageOneMetrics = stageOne.summary.metrics;
  const stageTwoMetrics = stageTwo.summary.metrics;
  const stageTwoDropRate = computeDropRate(stageTwoMetrics);
  const stageTwoFailureRate = computeFailureRate(stageTwoMetrics);
  const outstandingJobsStageOne = stageOneMetrics.jobsSubmitted - stageOneMetrics.jobsCompleted;
  const assertions: ScenarioAssertion[] = [
    {
      id: 'stage-one-stopped',
      description: 'Stage one halted intentionally via stop-after directive',
      passed: stageOne.result.run.stoppedEarly === true &&
        typeof stageOne.result.run.stopReason === 'string' &&
        stageOne.result.run.stopReason.includes('stop-after'),
      value: stageOne.result.run.stopReason,
    },
    {
      id: 'stage-one-outstanding',
      description: 'Outstanding jobs persisted for restart',
      passed: outstandingJobsStageOne > 0,
      value: outstandingJobsStageOne,
    },
    {
      id: 'stage-two-resumed',
      description: 'Stage two restored from checkpoint',
      passed: stageTwo.result.checkpointRestored === true || stageTwo.summary.run.checkpointRestored === true,
      value: stageTwo.result.checkpointRestored ?? stageTwo.summary.run.checkpointRestored,
    },
    {
      id: 'stage-two-not-stopped-early',
      description: 'Stage two completed without early halt',
      passed: stageTwo.result.run.stoppedEarly === false,
      value: stageTwo.result.run.stopReason,
    },
    {
      id: 'stage-two-drop-rate',
      description: `Post-resume drop rate <= ${(thresholds.maxDropRate * 100).toFixed(2)}%`,
      passed: stageTwoDropRate <= thresholds.maxDropRate,
      value: stageTwoDropRate,
      threshold: thresholds.maxDropRate,
    },
    {
      id: 'stage-two-failure-rate',
      description: `Post-resume failure rate <= ${(thresholds.maxFailureRate * 100).toFixed(2)}%`,
      passed: stageTwoFailureRate <= thresholds.maxFailureRate,
      value: stageTwoFailureRate,
      threshold: thresholds.maxFailureRate,
    },
  ];

  return {
    label: stageTwo.label,
    checkpointPath,
    stageOneSummaryPath: stageOne.result.artifacts.summaryPath,
    stageTwoSummaryPath: stageTwo.result.artifacts.summaryPath,
    stageOneRun: stageOne.result.run,
    stageTwoRun: stageTwo.result.run,
    stageTwoMetrics,
    stageTwoDropRate,
    stageTwoFailureRate,
    outstandingJobsStageOne,
    assertions,
    pass: assertions.every((assertion) => assertion.passed),
  };
}

export interface AcceptanceOptions {
  config: FabricConfig;
  ownerCommands?: OwnerCommandSchedule[];
  baseLabel: string;
  jobsHighLoad?: number;
  outageNodeId?: string;
  outageTick?: number;
  restartStopAfterTicks?: number;
  thresholds?: Partial<AcceptanceThresholds>;
  jobBlueprint?: JobBlueprint;
  jobBlueprintSource?: string;
  missionPlan?: SimulationOptions['missionPlan'];
}

export async function runAcceptanceSuite(options: AcceptanceOptions): Promise<AcceptanceReport> {
  const thresholds: AcceptanceThresholds = {
    ...DEFAULT_THRESHOLDS,
    ...(options.thresholds ?? {}),
  };
  const baseLabel = sanitiseLabel(options.baseLabel);
  const blueprintTotal = countJobsInBlueprint(options.jobBlueprint);
  const jobsHighLoad = options.jobsHighLoad ?? (blueprintTotal > 0 ? blueprintTotal : DEFAULT_HIGH_LOAD_JOBS);
  const restartStopAfterTicks = options.restartStopAfterTicks ?? DEFAULT_RESTART_STOP_TICKS;
  const outageDerived = Math.floor(jobsHighLoad / 400);
  const outageTick = options.outageTick ?? Math.min(OUTAGE_TICK_MAX, Math.max(OUTAGE_TICK_MIN, outageDerived));

  const highLoadCheckpoint = buildCheckpointPath(options.config.checkpoint.path, `${baseLabel}-high-load`);
  const restartCheckpoint = buildCheckpointPath(options.config.checkpoint.path, `${baseLabel}-restart`);

  const highLoadConfig = tuneConfigForAcceptance(options.config, highLoadCheckpoint);
  const restartConfigStageOne = tuneConfigForAcceptance(options.config, restartCheckpoint);
  const restartConfigStageTwo = tuneConfigForAcceptance(options.config, restartCheckpoint);

  const highLoadExecution = await executeScenario({
    config: highLoadConfig,
    ownerCommands: options.ownerCommands,
    label: `${baseLabel}-high-load`,
    checkpointPath: highLoadCheckpoint,
    jobs: jobsHighLoad,
    options: {
      simulateOutage: options.outageNodeId,
      outageTick,
      stopAfterTicks: undefined,
      resume: false,
      checkpointPath: highLoadCheckpoint,
      ownerCommands: undefined,
      preserveReportDirOnResume: undefined,
      jobBlueprint: options.jobBlueprint,
      jobBlueprintSource: options.jobBlueprintSource,
      missionPlan: options.missionPlan,
    },
  });

  const restartStageOne = await executeScenario({
    config: restartConfigStageOne,
    ownerCommands: options.ownerCommands,
    label: `${baseLabel}-restart`,
    checkpointPath: restartCheckpoint,
    jobs: jobsHighLoad,
    options: {
      simulateOutage: options.outageNodeId,
      outageTick,
      stopAfterTicks: restartStopAfterTicks,
      resume: false,
      checkpointPath: restartCheckpoint,
      ownerCommands: undefined,
      preserveReportDirOnResume: false,
      jobBlueprint: options.jobBlueprint,
      jobBlueprintSource: options.jobBlueprintSource,
      missionPlan: options.missionPlan,
    },
  });

  const restartStageTwo = await executeScenario({
    config: restartConfigStageTwo,
    ownerCommands: options.ownerCommands,
    label: `${baseLabel}-restart`,
    checkpointPath: restartCheckpoint,
    jobs: jobsHighLoad,
    options: {
      simulateOutage: options.outageNodeId,
      outageTick,
      stopAfterTicks: undefined,
      resume: true,
      checkpointPath: restartCheckpoint,
      ownerCommands: undefined,
      preserveReportDirOnResume: true,
      jobBlueprint: options.jobBlueprint,
      jobBlueprintSource: options.jobBlueprintSource,
      missionPlan: options.missionPlan,
    },
  });

  const highLoadReport = evaluateHighLoad(highLoadExecution, thresholds);
  const restartReport = evaluateRestart(restartStageOne, restartStageTwo, thresholds, restartCheckpoint);

  return {
    thresholds,
    highLoad: highLoadReport,
    restart: restartReport,
    overallPass: highLoadReport.pass && restartReport.pass,
    missionPlan: options.missionPlan,
  };
}

async function runFromCli(): Promise<void> {
  const argv = await yargs(hideBin(process.argv))
    .option('config', { type: 'string', describe: 'Path to fabric configuration JSON' })
    .option('plan', {
      type: 'string',
      describe: 'Mission plan JSON bundling config, blueprints, and owner schedules',
    })
    .option('owner-commands', {
      type: 'string',
      describe: 'Optional path to owner command schedule JSON',
    })
    .option('label', {
      type: 'string',
      describe: 'Base label for generated reports',
      default: `acceptance-${new Date().toISOString().replace(/[-:TZ]/g, '').slice(0, 12)}`,
    })
    .option('jobs-high-load', {
      type: 'number',
      describe: 'Number of jobs for the high-load scenario',
      default: DEFAULT_HIGH_LOAD_JOBS,
    })
    .option('jobs-blueprint', {
      type: 'string',
      describe: 'Optional job blueprint JSON file to seed both scenarios',
    })
    .option('outage-node', {
      type: 'string',
      describe: 'Node ID to simulate outage against',
    })
    .option('outage-tick', {
      type: 'number',
      describe: 'Tick when the outage should be triggered',
    })
    .option('restart-stop-after', {
      type: 'number',
      describe: 'Ticks to run before intentional orchestrator halt',
      default: DEFAULT_RESTART_STOP_TICKS,
    })
    .option('max-drop-rate', {
      type: 'number',
      describe: 'Maximum acceptable drop rate (0-1)',
    })
    .option('max-failure-rate', {
      type: 'number',
      describe: 'Maximum acceptable failure rate (0-1)',
    })
    .option('max-shard-balance-delta', {
      type: 'number',
      describe: 'Maximum acceptable shard throughput imbalance (0-1)',
    })
    .option('max-shard-skew-ratio', {
      type: 'number',
      describe: 'Maximum acceptable shard skew ratio (>=1)',
    })
    .check((parsed) => {
      const hasConfig = parsed.config !== undefined;
      const hasPlan = parsed.plan !== undefined;
      if (!hasConfig && !hasPlan) {
        throw new Error('Provide either --config or --plan to run the acceptance suite.');
      }
      if (hasConfig && hasPlan) {
        throw new Error('Use --config or --plan, but not both simultaneously.');
      }
      return true;
    })
    .parseAsync();

  const planPath = argv.plan as string | undefined;
  const plan = planPath ? await loadMissionPlan(planPath) : undefined;

  const configPath = argv.config as string | undefined;
  const config = configPath ? await loadFabricConfig(configPath) : plan!.config;

  const ownerCommandsPath = argv['owner-commands'] as string | undefined;
  let ownerCommands: OwnerCommandSchedule[] | undefined = plan?.ownerCommands;
  let ownerCommandSource: string | undefined = plan?.ownerCommandsSource;
  if (ownerCommandsPath) {
    ownerCommands = await loadOwnerCommandSchedule(ownerCommandsPath);
    ownerCommandSource = ownerCommandsPath;
  }

  const jobBlueprintPath = argv['jobs-blueprint'] as string | undefined;
  let jobBlueprint: JobBlueprint | undefined = plan?.jobBlueprint;
  let jobBlueprintSource = plan?.jobBlueprintSource;
  if (jobBlueprintPath) {
    jobBlueprint = await loadJobBlueprint(jobBlueprintPath);
    jobBlueprintSource = jobBlueprintPath;
  }

  const missionPlanInfo = plan
    ? {
        source: plan.source,
        label: plan.metadata?.label,
        description: plan.metadata?.description,
        author: plan.metadata?.author,
        version: plan.metadata?.version,
        tags: plan.metadata?.tags,
        run: plan.run,
        configSource: plan.configSource,
        ownerCommandsSource: ownerCommandSource ?? plan.ownerCommandsSource,
        jobBlueprintSource: jobBlueprintSource ?? plan.jobBlueprintSource,
      }
    : undefined;

  const thresholdsOverrides: Partial<AcceptanceThresholds> = {};
  if (typeof argv['max-drop-rate'] === 'number') {
    thresholdsOverrides.maxDropRate = argv['max-drop-rate'];
  }
  if (typeof argv['max-failure-rate'] === 'number') {
    thresholdsOverrides.maxFailureRate = argv['max-failure-rate'];
  }
  if (typeof argv['max-shard-balance-delta'] === 'number') {
    thresholdsOverrides.maxShardBalanceDelta = argv['max-shard-balance-delta'];
  }
  if (typeof argv['max-shard-skew-ratio'] === 'number') {
    thresholdsOverrides.maxShardSkewRatio = argv['max-shard-skew-ratio'];
  }

  const jobsHighLoadOverride =
    typeof argv['jobs-high-load'] === 'number' ? argv['jobs-high-load'] : plan?.run?.jobs;
  const outageNodeOverride = (argv['outage-node'] as string | undefined) ?? plan?.run?.simulateOutage;
  const outageTickOverride =
    typeof argv['outage-tick'] === 'number' ? argv['outage-tick'] : plan?.run?.outageTick;
  const restartStopAfterOverride =
    typeof argv['restart-stop-after'] === 'number'
      ? argv['restart-stop-after']
      : plan?.run?.stopAfterTicks;

  const report = await runAcceptanceSuite({
    config,
    ownerCommands,
    baseLabel: argv.label,
    jobsHighLoad: jobsHighLoadOverride,
    outageNodeId: outageNodeOverride,
    outageTick: outageTickOverride,
    restartStopAfterTicks: restartStopAfterOverride,
    thresholds: thresholdsOverrides,
    jobBlueprint,
    jobBlueprintSource: jobBlueprintSource,
    missionPlan: missionPlanInfo,
  });

  const headline = report.overallPass ? '✅ Acceptance suite PASSED' : '❌ Acceptance suite FAILED';
  console.log(headline);
  console.log(
    `   High-load drop rate: ${(report.highLoad.dropRate * 100).toFixed(2)}% | ` +
      `Restart drop rate: ${(report.restart.stageTwoDropRate * 100).toFixed(2)}%`
  );
  console.log(`   Reports saved under label base "${argv.label}".`);
  if (report.missionPlan) {
    const planLabel = report.missionPlan.label ?? 'Unnamed mission plan';
    const planSource = report.missionPlan.source ? `source: ${report.missionPlan.source}` : 'inline mission plan';
    const planTags = report.missionPlan.tags && report.missionPlan.tags.length > 0
      ? ` · tags: ${report.missionPlan.tags.join(', ')}`
      : '';
    console.log(`   Mission plan: ${planLabel} (${planSource}${planTags})`);
  }
  console.log(JSON.stringify(report, null, 2));

  if (!report.overallPass) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  runFromCli().catch((error) => {
    console.error('Acceptance suite failed', error);
    process.exitCode = 1;
  });
}
