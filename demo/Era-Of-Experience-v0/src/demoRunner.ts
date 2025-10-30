import path from 'node:path';
import { loadScenario, loadRewardWeights } from './scenario';
import { DemoResult, DemoRunOptions, ScenarioConfig, RunResult, TrajectoryPoint } from './types';
import { RewardComposer } from './reward';
import {
  ExperienceEngine,
  simulateOutcome,
  baselineSelection,
  createEmptyMetrics,
  updateRunMetrics,
  FEATURE_VECTOR_LENGTH
} from './engine';
import { DeterministicRandom } from './random';
import { generateJobs } from './jobs';
import { writeReports } from './reporting';

const DEFAULT_OUTPUT = path.resolve('demo/Era-Of-Experience-v0/reports');
const DEFAULT_REWARD = path.resolve('demo/Era-Of-Experience-v0/config/reward-default.json');

export async function runEraOfExperienceDemo(options: DemoRunOptions): Promise<DemoResult> {
  const scenario = await loadScenario(options.scenarioPath);
  const rewardWeights = await loadRewardWeights(options.rewardPath ?? DEFAULT_REWARD, scenario.reward);
  const rewardComposer = new RewardComposer(rewardWeights);

  const seed = options.seedOverride ?? scenario.seed;
  const rng = new DeterministicRandom(seed);
  const jobs = generateJobs(scenario.jobs, rng, options.jobCountOverride);

  const baselineRun = executeBaseline(scenario, jobs, rewardComposer, seed + 11);
  const learningRun = executeLearning(scenario, jobs, rewardComposer, seed + 29);

  const delta = computeDelta(baselineRun, learningRun);
  const result: DemoResult = {
    scenario,
    baseline: baselineRun,
    learning: learningRun,
    delta
  };

  if (options.writeReports !== false) {
    await writeReports(result, {
      outputDir: options.outputDir ?? DEFAULT_OUTPUT,
      uiDataPath: options.uiDataPath ?? path.resolve('demo/Era-Of-Experience-v0/ui/data/default-summary.json')
    });
  }

  return result;
}

function executeBaseline(
  scenario: ScenarioConfig,
  jobs: ReturnType<typeof generateJobs>,
  rewardComposer: RewardComposer,
  seed: number
): RunResult {
  const rng = new DeterministicRandom(seed);
  const metrics = createEmptyMetrics();
  const trajectory: TrajectoryPoint[] = [];

  jobs.forEach((job, index) => {
    const context = { job, market: scenario.market, agents: scenario.agents };
    const selectedIdx = baselineSelection(context);
    const features = scenario.agents.map(() => Array(FEATURE_VECTOR_LENGTH).fill(0));
    const probabilities = scenario.agents.map((_, idx) => (idx === selectedIdx ? 1 : 0));
    const outcome = simulateOutcome(
      context,
      scenario.agents[selectedIdx],
      rng,
      rewardComposer,
      features,
      selectedIdx,
      probabilities
    );
    const point = updateRunMetrics(metrics, outcome, outcome.reward, index);
    trajectory.push(point);
  });

  return {
    label: 'baseline',
    metrics,
    trajectory
  };
}

function executeLearning(
  scenario: ScenarioConfig,
  jobs: ReturnType<typeof generateJobs>,
  rewardComposer: RewardComposer,
  seed: number
): RunResult {
  if (!scenario.policy) {
    throw new Error('Scenario policy configuration missing');
  }
  const engine = new ExperienceEngine(
    {
      policy: scenario.policy,
      rewardComposer,
      maxAgents: scenario.agents.length
    },
    seed
  );
  const metrics = createEmptyMetrics();
  const trajectory: TrajectoryPoint[] = [];

  jobs.forEach((job, index) => {
    const context = { job, market: scenario.market, agents: scenario.agents };
    const { index: chosen, probabilities, features } = engine.selectAgent(context);
    const outcome = simulateOutcome(
      context,
      scenario.agents[chosen],
      engine.getDeterministicRandom(),
      rewardComposer,
      features,
      chosen,
      probabilities
    );
    const point = updateRunMetrics(metrics, outcome, outcome.reward, index);
    trajectory.push(point);
    engine.recordExperience(outcome.experience);
  });

  return {
    label: 'era-policy',
    metrics,
    trajectory
  };
}

function computeDelta(baseline: RunResult, learning: RunResult): Record<string, number> {
  return {
    gmvDelta: safeRatio(learning.metrics.gmv, baseline.metrics.gmv),
    roiDelta: safeRatio(learning.metrics.roi, baseline.metrics.roi),
    successDelta: safeRatio(learning.metrics.successes, baseline.metrics.successes),
    autonomyDelta: safeRatio(learning.metrics.autonomyLift, baseline.metrics.autonomyLift)
  };
}

function safeRatio(a: number, b: number): number {
  if (b === 0) {
    return a === 0 ? 1 : a;
  }
  return Number((a / b).toFixed(6));
}
